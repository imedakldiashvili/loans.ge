// Group 1 — admin configuration modules: productTypeField, status, statusTransition, setting, organizationProductType, move.
// Usage: node test/admin-config.mjs [baseUrl] [apiLogFile]
import { call, done, login, ok } from './lib.mjs';

await login('admin', '555000001'); // super admin by phone (email login is used by smoke.mjs — resend interval is per target)

const find = (m, body = {}, size = 100) => call('POST', `/admin/${m}/find/1/${size}`, body);

// ── productTypeField: list, add, move, select validation
const pt = (await find('productType', { Filter: { Search: 'სამომხმარებლო' } })).json.Data.Items[0];
const fields = (await find('productTypeField', { Filter: { ProductTypeID: pt.ID } })).json.Data.Items;
ok(fields.length > 5 && fields[0].Key === 'minAmt', 'productTypeField: list by product type, in order');

const key = 'test' + Date.now().toString(36);
const badSelect = await call('POST', '/admin/productTypeField/add', { ProductTypeID: pt.ID, Key: key, LabelKa: 'ტ', LabelEn: 'T', Kind: 'select', Options: ['ერთი'] });
ok(badSelect.status === 400 && badSelect.json.Error.Details.some((d) => d.Field === 'Options'), 'productTypeField: select needs 2+ options');
const f = await call('POST', '/admin/productTypeField/add', { ProductTypeID: pt.ID, Key: key, LabelKa: 'ტესტი', LabelEn: 'Test', Kind: 'bool', DefaultValue: true });
ok(f.status === 200, 'productTypeField: add (goes to the end)', f.json);
const added = (await call('GET', `/admin/productTypeField/detail/${f.json.Data.ID}/${f.json.Data.UID}`)).json.Data;
ok(added.Sort > fields[fields.length - 1].Sort, 'productTypeField: new field sort = last + 10');
const up = await call('PUT', `/admin/productTypeField/move/${f.json.Data.ID}/${f.json.Data.UID}`, { Direction: 'up' });
const after = (await find('productTypeField', { Filter: { ProductTypeID: pt.ID } })).json.Data.Items;
ok(up.status === 200 && after[after.length - 2].Key === key, 'move up: one position earlier');
const badMove = await call('PUT', `/admin/productTypeField/move/${f.json.Data.ID}/${f.json.Data.UID}`, { Direction: 'left' });
ok(badMove.status === 400, 'move: direction validated');
await call('DELETE', `/admin/productTypeField/delete/${f.json.Data.ID}/${f.json.Data.UID}`);

// ── city move inside its region
const cities = (await find('city', { Filter: { Search: '' } })).json.Data.Items;
const adjara = cities.filter((c) => c.RegionID === cities.find((x) => x.NameKa === 'ბათუმი').RegionID);
const kob = adjara.find((c) => c.NameKa === 'ქობულეთი');
await call('PUT', `/admin/city/move/${kob.ID}/${kob.UID}`, { Direction: 'up' });
const adj2 = (await find('city', { Filter: { RegionID: kob.RegionID } })).json.Data.Items.map((c) => c.NameKa);
ok(adj2[0] === 'ქობულეთი' && adj2[1] === 'ბათუმი', 'city move: only within its region', adj2);
await call('PUT', `/admin/city/move/${kob.ID}/${kob.UID}`, { Direction: 'down' });

// ── status: list, one expiry target, delete protection
const statuses = (await find('status')).json.Data.Items;
ok(statuses.length === 8 && statuses[0].Key === 'sent' && statuses[0].HidesPersonalData === true, 'status: 8 seeded, flags');
const sKey = 's' + Date.now().toString(36);
const twoTargets = await call('POST', '/admin/status/add', { Key: sKey, CustomerKa: 'ა', CustomerEn: 'A', PartnerLabel: 'ა', ChipLabel: 'ა', Category: 'canceled', IsExpiryTarget: true });
ok(twoTargets.status === 400 && twoTargets.json.Error.Details[0].Field === 'IsExpiryTarget', 'status: only one expiry target');
const sent = statuses.find((s) => s.Key === 'sent');
const delSent = await call('DELETE', `/admin/status/delete/${sent.ID}/${sent.UID}`);
ok(delSent.status === 409 && delSent.json.Error.Code === 'CONFLICT', 'status: used status cannot be deleted');
const ns = await call('POST', '/admin/status/add', { Key: sKey, CustomerKa: 'ტესტი', CustomerEn: 'Test', PartnerLabel: 'ტესტი', ChipLabel: 'ტესტი', Category: 'progress', TtlMinutes: 30 });
ok(ns.status === 200, 'status: add', ns.json);

// ── transitions
const tr = await call('POST', '/admin/statusTransition/add', { FromStatusID: sent.ID, ToStatusID: ns.json.Data.ID, Actor: 'partner' });
ok(tr.status === 200, 'statusTransition: add', tr.json);
const dup = await call('POST', '/admin/statusTransition/add', { FromStatusID: sent.ID, ToStatusID: ns.json.Data.ID, Actor: 'partner' });
ok(dup.status === 409, 'statusTransition: duplicate → 409');
const self = await call('POST', '/admin/statusTransition/add', { FromStatusID: sent.ID, ToStatusID: sent.ID, Actor: 'partner' });
ok(self.status === 400, 'statusTransition: same status rejected');
const fromSent = (await call('POST', '/admin/statusTransition/find/1/50', { Filter: { FromStatusID: sent.ID } })).json.Data.Items;
ok(fromSent.length === 5 && fromSent.every((t) => t.FromStatus.Key === 'sent'), 'statusTransition: filter + from/to keys', fromSent.map((t) => t.ToStatus.Key));
const delWithLinks = await call('DELETE', `/admin/status/delete/${ns.json.Data.ID}/${ns.json.Data.UID}`);
ok(delWithLinks.status === 409, 'status: with transitions cannot be deleted');
await call('DELETE', `/admin/statusTransition/delete/${tr.json.Data.ID}/${tr.json.Data.UID}`);
const again = await call('POST', '/admin/statusTransition/add', { FromStatusID: sent.ID, ToStatusID: ns.json.Data.ID, Actor: 'partner' });
ok(again.status === 200 && again.json.Data.ID !== tr.json.Data.ID, 'deleted transition can be added again (soft-deleted rows do not block)', again.json);
await call('DELETE', `/admin/statusTransition/delete/${again.json.Data.ID}/${again.json.Data.UID}`);
const delNs = await call('DELETE', `/admin/status/delete/${ns.json.Data.ID}/${ns.json.Data.UID}`);
ok(delNs.status === 200, 'status: unused status deleted');

// ── settings
const otp = (await call('POST', '/admin/setting/find/1/10', { Filter: { Search: 'otp' } })).json.Data.Items[0];
ok(otp && otp.Value.Sms.Len === 4 && otp.Value.Email.On === true, 'setting: otp seeded (PascalCase value)');
const bothOff = structuredClone(otp.Value);
bothOff.Sms.On = false;
bothOff.Email.On = false;
const off = await call('PUT', `/admin/setting/edit/${otp.ID}/${otp.UID}`, { Key: 'otp', Value: bothOff });
ok(off.status === 400 && off.json.Error.Details[0].Message.includes('ერთი არხი'), 'setting: at least one OTP channel on');
const badTpl = structuredClone(otp.Value);
badTpl.Sms.Tpl = 'no code here';
const tpl = await call('PUT', `/admin/setting/edit/${otp.ID}/${otp.UID}`, { Key: 'otp', Value: badTpl });
ok(tpl.status === 400 && tpl.json.Error.Details[0].Field === 'Value.Sms.Tpl', 'setting: template must contain {code}', tpl.json.Error);
const good = structuredClone(otp.Value);
good.Sms.Len = 6;
const save = await call('PUT', `/admin/setting/edit/${otp.ID}/${otp.UID}`, { Key: 'otp', Value: good });
const reread = (await call('GET', `/admin/setting/detail/${otp.ID}/${otp.UID}`)).json.Data;
ok(save.status === 200 && reread.Value.Sms.Len === 6, 'setting: edit round trip');
await call('PUT', `/admin/setting/edit/${otp.ID}/${otp.UID}`, { Key: 'otp', Value: otp.Value });

// ── organization product types
const org = (await find('organization', { Filter: { Search: 'ბანკი A' } })).json.Data.Items[0];
const opt = (await find('organizationProductType', { Filter: { OrganizationID: org.ID } })).json.Data.Items;
ok(opt.length === 7 && opt[0].ProductType.NameKa, 'organizationProductType: by organisation with product type');

done();
