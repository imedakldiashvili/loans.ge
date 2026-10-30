// Group 4 — admin views: application, offer, monitor, actionLog.
// Usage: node test/views.mjs [baseUrl] [apiLogFile]
import { call, done, login, ok } from './lib.mjs';

await login('admin', 'analyst@loans.ge'); // read-only role is enough for every view

// ── applications
const all = (await call('POST', '/admin/application/find/1/50', {})).json.Data;
const active = (await call('POST', '/admin/application/find/1/50', { Filter: { State: 'active' } })).json.Data;
const closed = (await call('POST', '/admin/application/find/1/50', { Filter: { State: 'done' } })).json.Data;
ok(all.TotalCount === 9, 'application: 9 demo applications', all.TotalCount);
ok(active.TotalCount + closed.TotalCount === all.TotalCount && active.TotalCount > 0 && closed.TotalCount > 0, 'application: active + done = all', [active.TotalCount, closed.TotalCount]);
ok(active.Items.every((a) => a.State === 'active') && closed.Items.every((a) => a.State === 'done'), 'application: computed state per row');
const a0 = all.Items[0];
ok(a0.ProductType.NameKa && a0.Orgs.length && a0.StatusCounts.every((c) => c.Status && c.Count) && typeof a0.Amount === 'number', 'application: product, organisations, status counts, numeric amount');
const byName = (await call('POST', '/admin/application/find/1/50', { Filter: { Search: 'ბერიძე' } })).json.Data;
ok(byName.TotalCount >= 1 && byName.Items.every((a) => a.LastName.includes('ბერიძე')), 'application: search by name');
const det = (await call('GET', `/admin/application/detail/${a0.ID}/${a0.UID}`)).json.Data;
ok(det.Orgs.every((o) => Array.isArray(o.Events) && o.Events.length >= 1 && o.Organization.NameKa), 'application detail: organisations with status history');

// ── offers (application × organisation)
const offers = (await call('POST', '/admin/offer/find/1/100', {})).json.Data;
ok(offers.TotalCount === 15, 'offer: 15 records', offers.TotalCount);
const inOffer = (await call('POST', '/admin/offer/find/1/100', { Filter: { Status: 'offer' } })).json.Data;
ok(inOffer.Items.every((o) => o.Status === 'offer') && inOffer.TotalCount > 0, 'offer: filter by current status');
const passedSent = (await call('POST', '/admin/offer/find/1/100', { Filter: { Status: 'sent', Passed: true } })).json.Data;
ok(passedSent.TotalCount === 15, 'offer: everyone passed through "sent"', passedSent.TotalCount);
const passedOffer = (await call('POST', '/admin/offer/find/1/100', { Filter: { Status: 'offer', Passed: true } })).json.Data;
ok(passedOffer.TotalCount >= inOffer.TotalCount, 'offer: passed ≥ current');
const o0 = offers.Items.find((o) => o.Offers.length);
const odet = (await call('GET', `/admin/offer/detail/${o0.ID}/${o0.UID}`)).json.Data;
ok(odet.Offers[0].Months > 0 && odet.Events.length && odet.Application.Pid, 'offer detail: terms, history, application');

// ── monitoring
const m = (await call('POST', '/admin/monitor/summary', {})).json.Data;
const t = m.Tiles;
ok(t.Total.Applications === 9 && t.Total.Offers === 15, 'monitor: totals 9 / 15', t.Total);
ok(t.Progress.Applications + t.Complete.Applications + t.Canceled.Applications === 9, 'monitor: categories add up to the total (applications)');
ok(t.Progress.Offers + t.Complete.Offers + t.Canceled.Offers === 15, 'monitor: categories add up to the total (offers)');
const count = (list, st) => list.find((c) => c.Status === st)?.Count ?? 0;
ok(count(m.Totals, 'sent') === 15 && m.Matrix.length > 0 && m.Statuses.length === 10, 'monitor: matrix of passed statuses ("sent" is the largest)');
const bankA = m.Matrix.find((r) => r.Organization.NameKa === 'მისო A');
const onlyA = (await call('POST', '/admin/monitor/summary', { Filter: { OrganizationID: bankA.Organization.ID } })).json.Data;
ok(onlyA.Matrix.length === 1 && count(onlyA.Totals, 'sent') === count(bankA.Counts, 'sent'), 'monitor: organisation filter');
const future = (await call('POST', '/admin/monitor/summary', { Filter: { From: '2099-01-01T00:00:00Z' } })).json.Data;
ok(future.Tiles.Total.Applications === 0, 'monitor: period filter');

// ── action log
const logs = (await call('POST', '/admin/actionLog/find/1/20', { Filter: { Module: 'monitor' } })).json.Data;
ok(logs.TotalCount >= 3 && logs.Items.every((l) => l.Module === 'monitor'), 'actionLog: filter by module');
const l0 = logs.Items[0];
const ldet = (await call('GET', `/admin/actionLog/detail/${l0.ID}/${l0.UID}`)).json.Data;
ok(ldet.Request && ldet.Response && ldet.Response.Body.IsSuccess === true, 'actionLog detail: request and response by uid');
const errors = (await call('POST', '/admin/actionLog/find/1/20', { Filter: { IsSuccess: false } })).json.Data;
ok(errors.Items.every((l) => l.IsSuccess === false && l.ErrorCode), 'actionLog: failed calls with error code');

done();
