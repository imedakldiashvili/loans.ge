// Group 2 — authentication: OTP login per gateway, sessions, profiles, admin roles, CreatedBy.
// Usage: node test/auth.mjs [baseUrl] [apiLogFile]
import { PrismaClient } from '@prisma/client';
import { call, done, forget, getCookie, login, ok, otpFromLog, setCookie } from './lib.mjs';

const prisma = new PrismaClient();
const stamp = Date.now().toString(36);

// ── no session
const anon = await call('POST', '/admin/city/find/1/5', {});
ok(anon.status === 401 && anon.json.Error.Code === 'UNAUTHORIZED', 'admin without session → 401');
ok((await call('GET', '/public/system/health')).status === 200, 'public gateway is open');

// ── sendOtp validation
ok((await call('POST', '/public/auth/sendOtp', { Gateway: 'admin', Login: 'nobody@loans.ge' })).status === 404, 'unknown admin → 404');
const badLogin = await call('POST', '/public/auth/sendOtp', { Gateway: 'admin', Login: '12345' });
ok(badLogin.status === 400 && badLogin.json.Error.Details[0].Field === 'Login', 'invalid phone → 400 on Login');
const staffPhone = await call('POST', '/public/auth/sendOtp', { Gateway: 'admin', Login: '555000001' });
ok(staffPhone.status === 400 && staffPhone.json.Error.Details[0].Field === 'Login', 'admin / partner log in by email only → a mobile number is 400 on Login');
const clientPhone = await call('POST', '/public/auth/sendOtp', { Gateway: 'client', Login: '555000001' });
ok(clientPhone.status === 400 && clientPhone.json.Error.Details[0].Field === 'Login', 'customers log in by email only too → a mobile number is 400 on Login');
ok((await call('POST', '/public/auth/loginMethod', { Login: '555000001' })).status === 400, 'loginMethod: a mobile number → 400');
ok((await call('POST', '/public/auth/sendOtp', { Gateway: 'partner', Login: 'sales3@1.ge' })).status === 403, 'disabled staff account → 403');

// ── operator: wrong code, resend limit, login
const s1 = await call('POST', '/public/auth/sendOtp', { Gateway: 'admin', Login: 'operator@loans.ge' });
ok(s1.status === 200 && Object.keys(s1.json.Data).join() === 'ID,UID,Length' && s1.json.Data.Length >= 4, 'sendOtp → { ID, UID, Length } (the code itself is never returned)');
const again = await call('POST', '/public/auth/sendOtp', { Gateway: 'admin', Login: 'operator@loans.ge' });
ok(again.status === 429 && again.json.Error.Code === 'RATE_LIMITED', 'resend before the interval → 429');
const code = await otpFromLog('operator@loans.ge');
// test environment: the OTP viewer outbox has the same code (DEV_OUTBOX=true in .env)
const box = await call('POST', '/dev/outbox/find/1/5', { Filter: { Search: 'operator@loans.ge' } });
ok(box.status === 200 && box.json.Data.Items[0]?.Code === code && box.json.Data.Items[0].IsUsed === false, 'dev outbox: latest code visible for the OTP viewer', box.json);
const wrong = String((Number(code) + 1) % 10 ** code.length).padStart(code.length, '0');
const w = await call('POST', '/public/auth/verifyOtp', { ID: s1.json.Data.ID, UID: s1.json.Data.UID, Otp: wrong });
ok(w.status === 400 && w.json.Error.Message.includes('დარჩა'), 'wrong code → 400 with tries left', w.json);
const v = await call('POST', '/public/auth/verifyOtp', { ID: s1.json.Data.ID, UID: s1.json.Data.UID, Otp: code });
const cookie = v.headers.get('set-cookie') ?? '';
ok(v.status === 200 && /lg_admin=.+HttpOnly/i.test(cookie), 'verifyOtp → session cookie (HttpOnly)');
setCookie('admin', cookie.split(';')[0]);
const reuse = await call('POST', '/public/auth/verifyOtp', { ID: s1.json.Data.ID, UID: s1.json.Data.UID, Otp: code });
ok(reuse.status === 404, 'a code works only once');
const box2 = await call('POST', '/dev/outbox/find/1/5', { Filter: { Search: 'operator@loans.ge' } });
ok(box2.json.Data.Items[0].IsUsed === true, 'dev outbox: used code marked as used');
const vLog = await prisma.actionLog.findUnique({ where: { uid: v.uid } });
const req = await prisma.actionLogRequest.findUnique({ where: { uid: v.uid } });
ok(vLog?.createdBy === BigInt(v.json.Data.ID) && req?.body?.Otp === '***', 'actionLog: verify → CreatedBy = user, Otp masked');

const me = await call('GET', '/admin/auth/me');
ok(me.status === 200 && me.json.Data.Profile.Role === 'operator' && me.json.Data.User.Email === 'operator@loans.ge', 'me: user + current profile');

// ── operator rights
ok((await call('POST', '/admin/city/find/1/5', {})).status === 200, 'operator: read references');
const addCur = await call('POST', '/admin/currency/add', { Code: 'XOP', Symbol: 'X' });
ok(addCur.status === 403 && addCur.json.Error.Code === 'FORBIDDEN', 'operator: cannot change references → 403');
const org = (await call('POST', '/admin/organization/find/1/1', { Filter: { Search: 'კრედო ბანკი' } })).json.Data.Items[0];
const dis = await call('PUT', `/admin/organization/disable/${org.ID}/${org.UID}`);
const orgRow = await prisma.organization.findUnique({ where: { id: BigInt(org.ID) } });
ok(dis.status === 200 && orgRow.updatedBy === BigInt(v.json.Data.ID), 'operator: changes organisations; UpdatedBy = operator');

// staff of a disabled organisation can't log in
ok((await call('POST', '/public/auth/sendOtp', { Gateway: 'partner', Login: 'sales1@6.ge' })).status === 403, 'staff of a disabled organisation → 403');
await call('PUT', `/admin/organization/enable/${org.ID}/${org.UID}`);

// ── analyst: read only
await login('admin', 'analyst@loans.ge');
ok((await call('POST', '/admin/status/find/1/5', {})).status === 200, 'analyst: read');
ok((await call('PUT', `/admin/organization/disable/${org.ID}/${org.UID}`)).status === 403, 'analyst: no changes → 403');

// ── partner: session is per gateway
const p = await login('partner', 'sales1@1.ge');
const pme = await call('GET', '/partner/auth/me');
ok(p.verify.status === 200 && pme.json.Data.Profile.ProfileType === 'staff' && pme.json.Data.Profile.Organization.NameKa === 'საქართველოს ბანკი', 'partner: staff profile with organisation');
const partnerToken = decodeURIComponent(getCookie('partner').split('=')[1]);
const cross = await call('POST', '/admin/city/find/1/5', {}, { Authorization: `Bearer ${partnerToken}`, Cookie: '' });
ok(cross.status === 401, 'partner session is not valid on admin');

// ── client: first login creates the user with a customer profile
const email = `new.${stamp}@example.com`;
const c = await login('client', email);
const cme = await call('GET', '/client/auth/me');
ok(c.verify.status === 200 && cme.json.Data.Profile.ProfileType === 'customer' && cme.json.Data.User.IsVerified === true, 'client: new user + customer profile');
const created = await prisma.user.findFirst({ where: { email }, include: { profiles: { include: { customer: true } } } });
ok(created.profiles.length === 1 && created.profiles[0].customer, 'new user has exactly one profile with customer details');

// staff member logging in as a borrower gets a customer profile too
forget('client');
await login('client', 'office@2.ge');
const both = await prisma.user.findFirst({ where: { email: 'office@2.ge' }, include: { profiles: { include: { profileType: true } } } });
ok(both.profiles.map((x) => x.profileType.code).sort().join() === 'customer,staff', 'existing staff user → customer profile added');

// ── logout
const out = await call('PUT', '/client/auth/logout');
ok(out.status === 200 && (await call('GET', '/client/auth/me')).status === 401, 'logout closes the session');

// ── tries exhausted
const t = await call('POST', '/public/auth/sendOtp', { Gateway: 'client', Login: `tries.${stamp}@example.com` });
const tc = await otpFromLog(`tries.${stamp}@example.com`);
const bad = String((Number(tc) + 1) % 10 ** tc.length).padStart(tc.length, '0');
for (let i = 0; i < 3; i++) await call('POST', '/public/auth/verifyOtp', { ID: t.json.Data.ID, UID: t.json.Data.UID, Otp: bad });
const locked = await call('POST', '/public/auth/verifyOtp', { ID: t.json.Data.ID, UID: t.json.Data.UID, Otp: tc });
ok(locked.status === 429, 'after the allowed tries even the right code is refused');

await prisma.$disconnect();
done();
