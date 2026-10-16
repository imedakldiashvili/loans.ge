// Smoke test of the API standards against a running API (default http://localhost:4000).
// Usage: node test/smoke.mjs [baseUrl] [apiLogFile]
import { PrismaClient } from '@prisma/client';
import { call, done, login, ok } from './lib.mjs';

const prisma = new PrismaClient();
await login('admin', 'admin@loans.ge');

const h = await call('GET', '/public/system/health');
ok(h.status === 200 && h.json.IsSuccess === true && 'Data' in h.json && 'Error' in h.json, 'health: { IsSuccess, Data, Error }');

const f = await call('POST', '/admin/city/find/1/5', { Filter: { Search: 'ბათ' } });
ok(f.status === 200 && f.json.Data.Items.length === 1 && f.json.Data.Items[0].NameKa === 'ბათუმი', 'find: Georgian search');
ok(['Items', 'PageNumber', 'PageSize', 'TotalCount', 'TotalPages'].every((k) => k in f.json.Data), 'find: paging fields');
ok(typeof f.json.Data.Items[0].RegionID === 'number', 'PascalCase with ID suffix (RegionID)');

const code = 'x' + Date.now().toString(36);
const add = await call('POST', '/admin/sector/add', { Code: code, NameKa: 'ტესტი', NameEn: 'Test' });
ok(add.status === 200 && Object.keys(add.json.Data).join() === 'ID,UID', 'add: 200 and Data = { ID, UID }');
const { ID, UID } = add.json.Data;

const ed = await call('PUT', `/admin/sector/edit/${ID}/${UID}`, { Code: code, NameKa: 'ტესტი 2', NameEn: 'Test 2', Sort: 5 });
ok(ed.status === 200 && ed.json.Data.ID === ID, 'edit');
const dis = await call('PUT', `/admin/sector/disable/${ID}/${UID}`);
const det = await call('GET', `/admin/sector/detail/${ID}/${UID}`);
ok(dis.status === 200 && det.json.Data.IsEnable === false && det.json.Data.NameKa === 'ტესტი 2' && det.json.Data.UpdatedOn, 'disable + detail');

const wrong = await call('GET', `/admin/sector/detail/${ID}/00000000-0000-0000-0000-000000000000`);
ok(wrong.status === 404 && wrong.json.IsSuccess === false && wrong.json.Error.Code === 'NOT_FOUND', 'id/uid mismatch → 404 NOT_FOUND');

const bad = await call('POST', '/admin/city/add', { Code: 'Bad Code' });
ok(bad.status === 400 && bad.json.Error.Code === 'VALIDATION_ERROR' && bad.json.Error.Details.some((d) => d.Field === 'NameKa' && d.Message === 'სავალდებულოა'), 'validation → 400 with Georgian details');

const del = await call('DELETE', `/admin/sector/delete/${ID}/${UID}`);
const after = await call('GET', `/admin/sector/detail/${ID}/${UID}`);
ok(del.status === 200 && after.status === 404, 'soft delete hides the record');
const row = await prisma.referenceItem.findUnique({ where: { id: BigInt(ID) } });
ok(row?.isDeleted === true && row.deletedOn, 'row kept with IsDeleted = true');

await new Promise((r) => setTimeout(r, 500));
const log = await prisma.actionLog.findUnique({ where: { uid: add.uid } });
const req = await prisma.actionLogRequest.findUnique({ where: { uid: add.uid } });
const res = await prisma.actionLogResponse.findUnique({ where: { uid: add.uid } });
ok(log && log.gateway === 'admin' && log.module === 'sector' && log.action === 'add' && log.responseCode === 200 && log.isSuccess && log.itemId === BigInt(ID) && log.itemUid === UID, 'actionLog: add with itemId/itemUid from Data');
ok(req?.body?.code === undefined && req?.body?.Code === code && res?.body?.IsSuccess === true, 'actionLogRequest / actionLogResponse by uid');
const errLog = await prisma.actionLog.findUnique({ where: { uid: wrong.uid } });
ok(errLog && errLog.isSuccess === false && errLog.responseCode === 404 && errLog.errorCode === 'NOT_FOUND' && errLog.itemId === BigInt(ID), 'actionLog: error call logged');

await prisma.$disconnect();
done();
