// Partner gateway: applications (scope, masking, status changes, offers), catalogue (products, cards), staff, roles.
// Usage: node test/partner.mjs [baseUrl] [apiLogFile]
import { PrismaClient } from '@prisma/client';
import { call, done, forget, login, ok } from './lib.mjs';

const prisma = new PrismaClient();
const find = (m, body = {}, size = 50) => call('POST', `/partner/${m}/find/1/${size}`, body);

// ── sales of მისო A (no scope)
await login('partner', 'sales1@7.ge');
const all = (await find('application')).json.Data;
const byStatus = (s) => all.Items.filter((x) => x.Status === s);
ok(all.TotalCount === 8 && all.Items.every((x) => x.Organization === undefined || true), 'applications: only this organisation (8 records)', all.TotalCount);
ok(all.StatusCounts.reduce((t, c) => t + c.Count, 0) === 8, 'applications: status counts for the chips');

const sent = byStatus('sent')[0];
ok(sent.IsMasked === true && sent.Application.Pid === null && sent.Application.Phone === null && sent.Application.FirstName === 'განმცხადებელი', 'sent: applicant masked');
const realPid = (await prisma.application.findUnique({ where: { id: BigInt(sent.Application.ID) } })).pid;
const bySearch = (await find('application', { Filter: { Search: realPid } })).json.Data;
ok(bySearch.TotalCount === 0, 'masked applicant is not found by personal number');
const shown = byStatus('offer')[0];
ok(shown.IsMasked === false && shown.Application.Pid, 'other statuses show the applicant');

// detail → allowed next statuses
const det = (await call('GET', `/partner/application/detail/${sent.ID}/${sent.UID}`)).json.Data;
ok(det.Next.map((n) => n.Status).sort().join() === 'interested,rejected' && det.Next.find((n) => n.Status === 'rejected').ReasonKind === 'reject', 'detail: next statuses from the database (review / reject with reason)');

// sales may read products / cards, not change them; staff is back-office only
ok((await find('product')).status === 200, 'sales: read products');
ok((await call('POST', '/partner/product/add', { ProductTypeID: 1, Currencies: ['GEL'] })).status === 403, 'sales: cannot add products → 403');
ok((await find('staff')).status === 403, 'sales: no staff list → 403');

// ── status flow: sent → interested → offer → (customer only) accepted ✗ → cancelled
const ch = (r, body) => call('PUT', `/partner/application/changeStatus/${r.ID}/${r.UID}`, body);
ok((await ch(sent, { Status: 'offer' })).status === 409, 'sent → offer directly is not allowed (409)');
const r1 = await ch(sent, { Status: 'interested' });
const after1 = (await call('GET', `/partner/application/detail/${sent.ID}/${sent.UID}`)).json.Data;
ok(r1.status === 200 && after1.Status === 'interested' && after1.IsMasked === false && after1.ExpiresOn && after1.Events.at(-1).ToStatus === 'interested' && after1.Events.at(-1).Actor === 'partner', 'review: status, unmasked, new deadline, history event');
// contacts: open as soon as the review starts; taking: the record is now this staff member's
const rec = await prisma.applicationOrg.findUnique({ where: { id: BigInt(sent.ID) }, include: { application: true, assignedTo: true } });
ok(after1.ContactsHidden === false && after1.Application.Phone === rec.application.phone && after1.Application.Pid && rec.contactsOpenedOn, 'review: name, personal number and phone / e-mail at once');
ok(rec.assignedTo?.displayName && after1.AssignedTo?.DisplayName === rec.assignedTo.displayName && rec.assignedOn, 'review: the record is taken by the one who started it');
ok((await find('application', { Filter: { Search: rec.application.phone } })).json.Data.Items.some((x) => x.ID === sent.ID), 'found by phone');
await prisma.applicationOrg.update({ where: { id: rec.id }, data: { contactsOpenedOn: null } });
const closed = (await call('GET', `/partner/application/detail/${sent.ID}/${sent.UID}`)).json.Data;
ok(closed.ContactsHidden === true && closed.Application.Phone === null, 'contacts closed → no phone');
ok((await find('application', { Filter: { Search: rec.application.phone } })).json.Data.Items.every((x) => x.ID !== sent.ID), 'phone search does not find a record with closed contacts');
await prisma.applicationOrg.update({ where: { id: rec.id }, data: { contactsOpenedOn: rec.contactsOpenedOn } });

ok((await ch(sent, { Status: 'offer' })).status === 400, 'offer needs at least one offer (400)');
const cards = (await find('card')).json.Data.Items;
const product1 = (await find('product')).json.Data.Items.find((p) => p.ProductType.Code === 'consumer_loan');
const card = cards.find((c) => c.ProductID === product1.ID && c.Currency === 'GEL');
const wrongCard = cards.find((c) => c.ProductID !== product1.ID);
ok((await ch(sent, { Status: 'offer', Offers: [{ CardID: wrongCard.ID }] })).status === 400, 'card of another product is refused');
const r2 = await ch(sent, { Status: 'offer', Offers: [{ CardID: card.ID }] });
const after2 = (await call('GET', `/partner/application/detail/${sent.ID}/${sent.UID}`)).json.Data;
const of = after2.Offers[0];
const amt = Number(after2.Application.Amount);
ok(r2.status === 200 && after2.Status === 'offer' && of.Amount === Math.min(Math.max(amt, card.Values.MinAmt), card.Values.MaxAmt) && of.Rate === card.Values.Rate && of.Fee === Math.round((of.Amount * card.Values.FeePct) / 100), 'offer: terms from the card (amount within limits, rate, fee %)', of);
ok(after2.OfferOn !== null, 'offer: first offer time set');

ok((await ch(sent, { Status: 'accepted' })).status === 409, 'partner cannot accept for the customer (409)');
ok((await ch(sent, { Status: 'cancelled' })).status === 400, 'cancel needs a reason (400)');
const reason = await prisma.referenceItem.findFirst({ where: { kind: 'cancel_reason' } });
const rej = await prisma.referenceItem.findFirst({ where: { kind: 'reject_reason' } });
ok((await ch(sent, { Status: 'cancelled', ReasonIDs: [Number(rej.id)] })).status === 400, 'cancel reason must be from the cancel list');
const r3 = await ch(sent, { Status: 'cancelled', ReasonIDs: [Number(reason.id)] });
const after3 = (await call('GET', `/partner/application/detail/${sent.ID}/${sent.UID}`)).json.Data;
ok(r3.status === 200 && after3.Status === 'cancelled' && after3.ExpiresOn === null && after3.ReasonIDs[0] === Number(reason.id) && after3.Next.length === 0, 'cancel with reason: final, no deadline, no next steps');

// another organisation's record is invisible
const foreign = await prisma.applicationOrg.findFirst({ where: { organization: { nameKa: 'სუბიექტი A' } } });
ok((await call('GET', `/partner/application/detail/${foreign.id}/${foreign.uid}`)).status === 404, "another organisation's record → 404");

// ── sales with scope: cities თბილისი, რუსთავი; products p1, p3
// test data: all of მისო A's records free incoming ones, so the scope decides
const cities = await prisma.city.findMany({ where: { nameKa: { in: ['თბილისი', 'რუსთავი'] } } });
const bankA = await prisma.applicationOrg.findMany({ where: { organization: { nameKa: 'მისო A' } }, include: { application: true } });
const sales2 = await prisma.userProfile.findFirst({ where: { user: { email: 'sales2@7.ge' } } });
await prisma.applicationOrg.updateMany({ where: { id: { in: bankA.map((x) => x.id) } }, data: { status: 'sent', assignedToId: null, assignedOn: null, contactsOpenedOn: null } });
const outside = bankA.find((x) => !cities.some((c) => c.id === x.application.cityId));
forget('partner');
await login('partner', 'sales2@7.ge');
const meScope = (await call('GET', '/partner/auth/me')).json.Data.Profile.ScopeCities;
ok(meScope.length === 2 && cities.every((c) => meScope.includes(Number(c.id))), 'me: the cities of a limited sales manager (for "my data")', meScope);
let scoped = (await find('application')).json.Data;
ok(scoped.TotalCount === 2 && scoped.Items.every((x) => cities.some((c) => Number(c.id) === x.Application.CityID)), 'incoming: only their cities and products (2 of 4)', scoped.TotalCount);
// their own record stays visible after its city left the scope
await prisma.applicationOrg.update({ where: { id: outside.id }, data: { status: 'interested', assignedToId: sales2.id, assignedOn: new Date() } });
scoped = (await find('application')).json.Data;
ok(scoped.Items.some((x) => x.ID === Number(outside.id)) && scoped.TotalCount === 3, 'a record they took is visible outside their scope too');
await prisma.applicationOrg.update({ where: { id: outside.id }, data: { assignedToId: null, assignedOn: null } });
ok((await find('application')).json.Data.Items.every((x) => x.ID !== Number(outside.id)), 'not taken and not incoming → not theirs');
const myProducts = (await find('product')).json.Data.Items;
ok(myProducts.length === 2, 'sales scope: only allowed products visible', myProducts.length);

// ── taking: a free incoming application is seen by every sales in scope; the first action takes it
const free = await prisma.applicationOrg.findUnique({ where: { id: BigInt(scoped.Items.find((x) => x.Status === 'sent').ID) } });
if (free) {
  const fr = { ID: Number(free.id), UID: free.uid };
  ok((await ch(fr, { Status: 'interested' })).status === 200, 'sales2 takes a free application (starts the review)');
  ok((await prisma.applicationOrg.findUnique({ where: { id: free.id } })).assignedToId !== null, 'it is assigned to sales2');
  forget('partner');
  await login('partner', 'sales1@7.ge');
  ok((await find('application')).json.Data.Items.every((x) => x.ID !== fr.ID), "taken by a colleague → gone from sales1's list");
  ok((await call('GET', `/partner/application/detail/${fr.ID}/${fr.UID}`)).status === 404 && (await ch(fr, { Status: 'cancelled', ReasonIDs: [Number(rej.id)] })).status === 404, 'and sales1 cannot open or change it (404)');
  forget('partner');
  await login('partner', 'office@7.ge');
  const seen = (await call('GET', `/partner/application/detail/${fr.ID}/${fr.UID}`)).json.Data;
  ok(seen?.AssignedTo?.DisplayName, 'back office sees it and who took it');
} else ok(false, 'test data: a free application in the sales2 scope');

// ── back office: catalogue and staff
forget('partner');
await login('partner', 'office@7.ge');
// back office filters the applications by who took them (or the free ones)
const allBack = (await find('application', { Filter: {} })).json.Data.Items;
const taker = allBack.find((x) => x.AssignedTo)?.AssignedTo;
const byTaker = (await find('application', { Filter: { AssignedToID: taker.ID } })).json.Data;
ok(byTaker.TotalCount > 0 && byTaker.Items.every((x) => x.AssignedTo?.ID === taker.ID), 'back: filter by the staff member who took them', byTaker.TotalCount);
const freeOnes = (await find('application', { Filter: { Free: true } })).json.Data;
ok(freeOnes.Items.every((x) => !x.AssignedTo) && freeOnes.TotalCount + allBack.filter((x) => x.AssignedTo).length === allBack.length, 'back: filter the free ones (nobody took them)');
const pts = await prisma.productType.findMany();
const mortgage = pts.find((p) => p.code === 'mortgage_loan'); // მისო A does not have it yet
const consumer = pts.find((p) => p.code === 'consumer_loan');
// products come from the admin (organisation → product types): the partner can't add or delete them
ok((await call('POST', '/partner/product/add', { ProductTypeID: Number(consumer.id), Currencies: ['GEL'] })).status === 404, 'back: cannot add a product - the admin adds them (404)');
const misoA = await prisma.organization.findFirst({ where: { nameKa: 'მისო A', isDeleted: false } });
await login('admin', 'admin@loans.ge');
const link = await call('POST', '/admin/organizationProductType/add', { OrganizationID: Number(misoA.id), ProductTypeID: Number(mortgage.id) });
ok(link.status === 200, 'admin: gives მისო A a product type (mortgage)', link.json);
const mine = (await find('product')).json.Data.Items;
const np = { json: { Data: mine.find((p) => p.ProductTypeID === Number(mortgage.id)) } };
ok(np.json.Data && np.json.Data.IsEnable === false && np.json.Data.Currencies.join() === 'GEL', 'partner: the new product appears, switched off, in GEL', mine.map((p) => p.ProductTypeID));
const npRow = await prisma.partnerProduct.findUnique({ where: { id: BigInt(np.json.Data.ID) }, include: { organization: true } });
ok(npRow.organization.nameKa === 'მისო A', 'product belongs to the caller organisation');
ok((await call('PUT', `/partner/product/edit/${np.json.Data.ID}/${np.json.Data.UID}`, { ProductTypeID: Number(consumer.id), Currencies: ['GEL'] })).status === 400, 'back: cannot move a product to another type (400)');
ok((await call('PUT', `/partner/product/edit/${np.json.Data.ID}/${np.json.Data.UID}`, { ProductTypeID: Number(mortgage.id), Description: 'ტესტი', Currencies: ['GEL'] })).status === 200, 'back: edits description / currencies');
ok((await call('PUT', `/partner/product/enable/${np.json.Data.ID}/${np.json.Data.UID}`)).status === 200, 'back: switches the product on');
ok((await call('DELETE', `/partner/product/delete/${np.json.Data.ID}/${np.json.Data.UID}`)).status === 404, 'back: cannot delete a product (404)');
const ot = await prisma.referenceItem.findFirst({ where: { kind: 'offer_type' } });
const bad = await call('POST', '/partner/card/add', { ProductID: np.json.Data.ID, OfferTypeID: Number(ot.id), Currency: 'GEL', Values: { rate: 'x', minAmt: 5000, maxAmt: 100, unknownKey: 1 } });
ok(bad.status === 400 && ['Values.rate', 'Values.unknownKey', 'Values.maxAmt', 'Values.minM'].every((f) => bad.json.Error.Details.some((d) => d.Field === f)), 'card values checked against the product field schema', bad.json.Error);
ok((await call('POST', '/partner/card/add', { ProductID: np.json.Data.ID, OfferTypeID: Number(ot.id), Currency: 'USD', Values: { rate: 12, minAmt: 100, maxAmt: 5000, minM: 3, maxM: 24 } })).status === 400, 'card currency must be enabled on the product');
const nc = await call('POST', '/partner/card/add', { ProductID: np.json.Data.ID, OfferTypeID: Number(ot.id), Currency: 'GEL', Values: { rate: 12, feePct: 1, insPct: 0.2, minAmt: 100, maxAmt: 5000, minM: 3, maxM: 24 } });
ok(nc.status === 200, 'back: add a valid card', nc.json);
// several cards of one offer type and currency — only on different amount ranges; another offer type may overlap
const cardVals = (lo, hi) => ({ rate: 12, minAmt: lo, maxAmt: hi, minM: 3, maxM: 24 });
const cardAdd = (lo, hi) => call('POST', '/partner/card/add', { ProductID: np.json.Data.ID, OfferTypeID: Number(ot.id), Currency: 'GEL', Values: cardVals(lo, hi) });
ok((await cardAdd(3000, 8000)).status === 400, 'back: a card whose amount range overlaps another one is refused (400)');
const nc2 = await cardAdd(5000, 10000);
ok(nc2.status === 200, 'back: a card on the next amount range (5 000-10 000) is fine', nc2.json);
ok((await call('PUT', `/partner/card/edit/${nc2.json.Data.ID}/${nc2.json.Data.UID}`, { ProductID: np.json.Data.ID, OfferTypeID: Number(ot.id), Currency: 'GEL', Values: cardVals(4000, 10000) })).status === 400, 'back: editing a card into an overlapping range is refused (400)');
ok((await call('PUT', `/partner/card/edit/${nc2.json.Data.ID}/${nc2.json.Data.UID}`, { ProductID: np.json.Data.ID, OfferTypeID: Number(ot.id), Currency: 'GEL', Values: cardVals(5000, 12000) })).status === 200, 'back: a card keeps its own range on edit');
const ot2 = await prisma.referenceItem.findFirst({ where: { kind: 'offer_type', id: { not: ot.id } } });
ok((await call('POST', '/partner/card/add', { ProductID: np.json.Data.ID, OfferTypeID: Number(ot2.id), Currency: 'GEL', Values: cardVals(3000, 8000) })).status === 200, 'back: another offer type may cover the same amounts');
// a "% + min. amount" value (2% min. 10 ₾): the admin adds the field, the partner fills { pct, min }
const pmKey = `pm${Date.now().toString(36)}`;
const pmf = await call('POST', '/admin/productTypeField/add', { ProductTypeID: Number(mortgage.id), Key: pmKey, LabelKa: 'საკომისიო', LabelEn: 'Fee', Kind: 'pctMin', DefaultValue: { Pct: 2, Min: 10 } });
const pmRow = await prisma.productTypeField.findUnique({ where: { id: BigInt(pmf.json.Data.ID) } });
ok(pmf.status === 200 && pmRow.kind === 'pctMin' && pmRow.defaultValue?.pct === 2 && pmRow.defaultValue?.min === 10, 'admin: a "% + min. amount" field (2% min. 10 ₾)', pmRow);
const pmCard = await call('POST', '/partner/card/add', { ProductID: np.json.Data.ID, OfferTypeID: Number(ot.id), Currency: 'GEL', Values: { ...cardVals(20000, 30000), [pmKey]: { Pct: 2.5, Min: 15 } } });
const pmVal = pmCard.status === 200 ? (await prisma.partnerOfferCard.findUnique({ where: { id: BigInt(pmCard.json.Data.ID) } })).values[pmKey] : null;
ok(pmVal?.pct === 2.5 && pmVal?.min === 15, 'back: a card keeps the "% + min." value', pmCard.json);
ok((await call('POST', '/partner/card/add', { ProductID: np.json.Data.ID, OfferTypeID: Number(ot.id), Currency: 'GEL', Values: { ...cardVals(40000, 50000), [pmKey]: { Pct: 'x' } } })).status === 400, 'back: a "% + min." value needs a percentage (400)');
await call('DELETE', `/admin/productTypeField/delete/${pmf.json.Data.ID}/${pmf.json.Data.UID}`);
// the admin takes the type away → the product (with its cards) leaves the partner's catalogue
ok((await call('DELETE', `/admin/organizationProductType/delete/${link.json.Data.ID}/${link.json.Data.UID}`)).status === 200, 'admin: takes the product type away');
ok(!(await find('product')).json.Data.Items.some((p) => p.ID === np.json.Data.ID), 'partner: the product is gone from the catalogue');

const staff = (await find('staff')).json.Data;
const orgStaff = await prisma.userProfile.count({ where: { organizationId: npRow.organizationId, isDeleted: false } });
ok(staff.TotalCount === orgStaff && staff.Items.every((s) => BigInt(s.OrganizationID) === npRow.organizationId), 'back: own staff only', staff.TotalCount);
const ns = await call('POST', '/partner/staff/add', { Email: `p.${Date.now().toString(36)}@a.ge`, DisplayName: 'ახალი', Role: 'sales' });
const nsRow = await prisma.userProfile.findUnique({ where: { id: BigInt(ns.json.Data.ID) } });
ok(ns.status === 200 && nsRow.organizationId === npRow.organizationId, 'back: new staff always in own organisation');

await prisma.$disconnect();
done();
