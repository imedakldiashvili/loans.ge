// Integration and notifications: API keys on the partner gateway (scopes), signed webhooks with retries,
// the bell (staff and customer), staff e-mail, push subscription.
// Usage: node test/integration.mjs [baseUrl] [apiLogFile]  (the API must run with WEBHOOK_INTERVAL_SECONDS=1)
import { PrismaClient } from '@prisma/client';
import { createHmac } from 'crypto';
import { readFileSync } from 'fs';
import { createServer } from 'http';
import { B, call, done, forget, LOG, login, ok, otpFromLog } from './lib.mjs';

const prisma = new PrismaClient();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stamp = Date.now().toString().slice(-8);

// ── a bank's webhook receiver: records requests; answers 500 while `failing`
const got = [];
let failing = false;
const server = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    got.push({ headers: req.headers, body });
    res.writeHead(failing ? 500 : 200).end(failing ? 'down' : 'ok');
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const hookUrl = `http://127.0.0.1:${server.address().port}/hook`;
const waitFor = async (pred, ms = 6000) => {
  for (let t = 0; t < ms; t += 200) {
    const x = got.find(pred);
    if (x) return x;
    await sleep(200);
  }
  return null;
};

// ── back office of მისო A: API key and webhook
await login('partner', 'office@7.ge');
const me = (await call('GET', '/partner/auth/me')).json.Data;
const orgId = me.Profile.Organization.ID;
ok((await call('POST', '/partner/apiKey/add', { Name: 'x', Scopes: ['everything'] })).status === 400, 'API key: unknown scope → 400');
const k = await call('POST', '/partner/apiKey/add', { Name: 'core banking', Scopes: ['applications:read'] });
const key = k.json.Data?.Key;
ok(k.status === 200 && /^lgk_[0-9a-f]{8}_/.test(key ?? ''), 'API key created, shown once', k.json);
const keys = (await call('POST', '/partner/apiKey/find/1/50', {})).json.Data.Items;
ok(keys.some((x) => x.ID === k.json.Data.ID && x.Prefix === key.slice(4, 12)) && keys.every((x) => !('KeyHash' in x)), 'key list: prefix only, never the hash');

const w = await call('POST', '/partner/webhook/add', { Url: hookUrl, Events: ['application.created', 'application.status'] });
const secret = w.json.Data?.Secret;
ok(w.status === 200 && /^whsec_/.test(secret ?? ''), 'webhook created with a signing secret', w.json);
ok((await call('POST', '/partner/webhook/add', { Url: 'ftp://x', Events: ['application.created'] })).status === 400, 'webhook: bad URL → 400');
const hooks = (await call('POST', '/partner/webhook/find/1/50', {})).json.Data.Items;
ok(hooks.length >= 1 && hooks.every((h) => !('Secret' in h)), 'webhook list without the secret');

// ping, signed
await call('POST', `/partner/webhook/test/${w.json.Data.ID}/${w.json.Data.UID}`);
const ping = await waitFor((r) => r.headers['x-loans-event'] === 'ping');
const verify = (r) => r && r.headers['x-loans-signature'] === `sha256=${createHmac('sha256', secret).update(`${r.headers['x-loans-timestamp']}.${r.body}`).digest('hex')}`;
ok(ping && verify(ping) && JSON.parse(ping.body).DeliveryUID === ping.headers['x-loans-delivery'], 'ping delivered, HMAC signature checks out');

// ── the key at work (no session): read allowed, the rest refused
const withKey = (method, path, body, k2 = key) => fetch(B + path, { method, headers: { 'Content-Type': 'application/json', 'X-Api-Key': k2 }, body: body ? JSON.stringify(body) : undefined }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => null) }));
const list = await withKey('POST', '/partner/application/find/1/50', {});
ok(list.status === 200 && list.json.Data.Items.length > 0, 'API key: own applications');
const one = list.json.Data.Items[0];
ok((await withKey('PUT', `/partner/application/changeStatus/${one.ID}/${one.UID}`, { Status: 'interested' })).status === 403, 'read-only key cannot change a status (403)');
ok((await withKey('POST', '/partner/staff/find/1/10', {})).status === 403, 'API key: staff is not reachable (403)');
ok((await withKey('GET', '/partner/auth/me')).status === 403, 'API key: no session endpoints (403)');
ok((await withKey('POST', '/partner/application/find/1/5', {}, `${key.slice(0, -2)}xx`)).status === 401, 'wrong key → 401');
// the log row is written after the response has gone out — wait for it (up to 3 s)
let log = null;
for (let i = 0; i < 30 && !log; i++) {
  log = await prisma.actionLog.findFirst({ where: { url: { contains: '/partner/application/find/1/50' }, actorType: 'integration' }, orderBy: { id: 'desc' } });
  if (!log) await new Promise((r) => setTimeout(r, 100));
}
ok(log && log.createdBy === null, 'actionLog: calls with a key logged as integration');

// ── a customer applies to მისო A → webhook, the bell, staff e-mail
const email = `int.${stamp}@example.com`;
const phone = `5${String(Number(stamp) + 7).slice(-8)}`;
await login('client', email);
const pt = await prisma.productType.findFirst({ where: { code: 'consumer_loan' } });
const city = await prisma.city.findFirst({ where: { nameKa: 'თბილისი' } });
const s = await call('POST', '/client/application/sendPhoneOtp', { Phone: phone });
const code = await otpFromLog(phone);
const add = await call('POST', '/client/application/add', {
  ProductTypeID: Number(pt.id), Amount: 4000, Currency: 'GEL', CreditHistory: 'პოზიტიური', Sector: 'კერძო სექტორი', Incomes: [{ Src: 'ხელფასი', Amount: 2000 }],
  OrganizationIDs: [orgId], Pid: '01001012399', FirstName: 'ინტ', LastName: 'ტესტი', BirthDate: '1991-01-01', Phone: phone, CityID: Number(city.id),
  Otp: { ID: s.json.Data.ID, UID: s.json.Data.UID, Code: code },
});
ok(add.status === 200, 'customer application to მისო A', add.json);
const created = await waitFor((r) => r.headers['x-loans-event'] === 'application.created' && JSON.parse(r.body).Data.ApplicationID === add.json.Data.ID);
const data = created && JSON.parse(created.body).Data;
ok(created && verify(created) && data.Status === 'sent' && data.ApplicationOrgUID, 'webhook: application.created, signed', data);
const det = await withKey('GET', `/partner/application/detail/${data.ApplicationOrgID}/${data.ApplicationOrgUID}`);
ok(det.status === 200 && det.json.Data.IsMasked === true, 'the bank reads the new application with its key (masked while "sent")');

await sleep(500);
const bell = (await call('POST', '/partner/notification/find/1/10', {})).json.Data;
ok(bell.UnreadCount >= 1 && bell.Items[0].Title === 'ახალი განაცხადი' && bell.Items[0].ApplicationOrgID === data.ApplicationOrgID, 'staff bell: "new application"', bell.Items[0]);
ok((await call('PUT', '/partner/notification/readAll')).status === 200 && (await call('POST', '/partner/notification/find/1/10', {})).json.Data.UnreadCount === 0, 'read all → no unread');
ok(readFileSync(LOG, 'utf8').includes('→ office@7.ge | loans.ge - ახალი განაცხადი'), 'staff e-mail about the new application');

// ── partner reviews → the customer's bell; receiver down → retry scheduled
failing = true;
const ao = await prisma.applicationOrg.findUnique({ where: { id: BigInt(data.ApplicationOrgID) } });
ok((await call('PUT', `/partner/application/changeStatus/${ao.id}/${ao.uid}`, { Status: 'interested' })).status === 200, 'partner takes it into review');
await waitFor((r) => r.headers['x-loans-event'] === 'application.status');
await sleep(800);
const d = await prisma.webhookDelivery.findFirst({ where: { event: 'application.status', organizationId: BigInt(orgId) }, orderBy: { id: 'desc' } });
ok(d.status === 'pending' && d.attempts === 1 && d.responseCode === 500 && d.nextAttemptOn > new Date(Date.now() + 50_000), 'receiver answered 500 → retry in a minute', { status: d.status, attempts: d.attempts });
failing = false;
const rd = await call('PUT', `/partner/webhookDelivery/redeliver/${d.id}/${d.uid}`);
await sleep(2000);
const d2 = await prisma.webhookDelivery.findUnique({ where: { id: d.id } });
ok(rd.status === 200 && d2.status === 'ok' && d2.attempts === 2, 'redeliver → delivered');
const deliveries = (await call('POST', '/partner/webhookDelivery/find/1/20', {})).json.Data;
ok(deliveries.Items.every((x) => x.OrganizationID === orgId), 'delivery log: own organisation only');

const cbell = (await call('POST', '/client/notification/find/1/10', {})).json.Data;
ok(cbell.Items[0]?.Title === 'მისო A განიხილავს შენს განაცხადს' && cbell.UnreadCount === 1, 'customer bell: "მისო A is reviewing"', cbell.Items[0]);
ok((await call('PUT', `/client/notification/read/${cbell.Items[0].ID}/${cbell.Items[0].UID}`)).status === 200, 'customer marks it read');
ok((await call('PUT', `/partner/notification/read/${cbell.Items[0].ID}/${cbell.Items[0].UID}`)).status === 404, "staff can't touch the customer's notification");

// ── push subscription
const pk = (await call('GET', '/public/push/key')).json.Data;
ok(typeof pk.PublicKey === 'string' && pk.PublicKey.length > 40, 'push: public key');
ok((await call('POST', '/client/push/subscribe', { Endpoint: `https://push.example.com/${stamp}`, Keys: { P256dh: 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U', Auth: 'tBHItJI5svbpez7KI4CCXg' } })).status === 200, 'push: subscribe');

// ── disabled key stops working; admin sees deliveries
await call('PUT', `/partner/apiKey/disable/${k.json.Data.ID}/${k.json.Data.UID}`);
ok((await withKey('POST', '/partner/application/find/1/5', {})).status === 401, 'disabled key → 401');
forget('partner');
await login('admin', 'analyst@loans.ge');
ok((await call('POST', '/admin/webhookDelivery/find/1/10', {})).json.Data.TotalCount >= 3, 'admin: webhook delivery log');
ok((await call('POST', '/admin/apiKey/find/1/10', {})).status === 200, 'admin: API keys of all organisations');

// ── API description (Swagger)
const doc = await fetch(`${B}/docs/openapi.json`).then((r) => r.json());
ok(doc.openapi?.startsWith('3.') && doc.paths['/partner/application/changeStatus/{id}/{uid}'] && doc.components.securitySchemes.ApiKey.name === 'X-Api-Key', 'OpenAPI: partner endpoints and the API key scheme');
const cs = doc.paths['/partner/application/changeStatus/{id}/{uid}'].put.requestBody.content['application/json'].schema;
ok(cs.properties.Status && cs.properties.Offers && cs.required?.includes('Status'), 'OpenAPI: request bodies from the validation schemas, PascalCase', Object.keys(cs.properties ?? {}));
ok((await fetch(`${B}/docs`)).status === 200, 'Swagger UI at /docs');

server.close();
await prisma.$disconnect();
done();
