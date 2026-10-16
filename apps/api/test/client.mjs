// Client gateway: first login creates the account, application with phone confirmation, my applications,
// accept / decline per organisation, closing the whole application, profile, isolation between customers.
// Usage: node test/client.mjs [baseUrl] [apiLogFile]
import { PrismaClient } from '@prisma/client';
import { call, done, forget, login, ok, otpFromLog } from './lib.mjs';

const prisma = new PrismaClient();
const stamp = Date.now().toString().slice(-8);
const email = `client.test.${stamp}@example.com`;
const phone = `5${stamp}`;

// ── public: home numbers, organisations with the product types they accept
const stats = (await call('GET', '/public/stats/summary')).json.Data;
ok(stats.Applications > 0 && stats.Organizations > 0, 'public stats: applications / organisations', stats);
const pt = await prisma.productType.findFirst({ where: { code: 'consumer_loan' } });
const orgs = (await call('POST', '/public/organization/find/1/100', {})).json.Data.Items;
const accepting = orgs.filter((o) => o.IsPartner && o.ProductTypes.some((x) => x.ProductTypeID === Number(pt.id)));
ok(accepting.length >= 2, 'public organisations carry their accepted product types');
const notAccepting = orgs.find((o) => o.IsPartner && !o.ProductTypes.some((x) => x.ProductTypeID === Number(pt.id)));

// ── first login creates the customer
const l = await login('client', email);
ok(l.verify?.status === 200, 'client: first login creates the account');
const me = (await call('GET', '/client/auth/me')).json.Data;
ok(me.Profile?.ProfileType === 'customer', 'client: customer profile');

const city = await prisma.city.findFirst({ where: { nameKa: 'თბილისი' } });
const district = await prisma.district.findFirst({ where: { cityId: city.id } });
const otherCityDistrict = await prisma.district.findFirst({ where: { NOT: { cityId: city.id } } });
const body = {
  ProductTypeID: Number(pt.id), Amount: 5000, Currency: 'GEL', CreditHistory: 'პოზიტიური', Sector: 'კერძო სექტორი',
  Incomes: [{ Src: 'ხელფასი', Amount: 2500 }], Banks: ['ბანკი A'], OrganizationIDs: accepting.slice(0, 2).map((o) => o.ID),
  Pid: '01001012345', FirstName: 'ტესტ', LastName: 'კლიენტი', BirthDate: '1990-05-01', Phone: phone, CityID: Number(city.id), DistrictID: Number(district.id),
};

// phone confirmation: required for a phone the account doesn't have yet
ok((await call('POST', '/client/application/add', body)).status === 400, 'add without the SMS code → 400');
if (notAccepting) ok((await call('POST', '/client/application/add', { ...body, OrganizationIDs: [notAccepting.ID] })).status === 400, 'organisation that does not take this product → 400');
if (otherCityDistrict) ok((await call('POST', '/client/application/add', { ...body, DistrictID: Number(otherCityDistrict.id) })).status === 400, 'district of another city → 400');
const s = await call('POST', '/client/application/sendPhoneOtp', { Phone: phone });
ok(s.status === 200, 'SMS code to the application phone');
const code = await otpFromLog(phone);
ok((await call('POST', '/client/application/add', { ...body, Otp: { ID: s.json.Data.ID, UID: s.json.Data.UID, Code: code === '0000' ? '1111' : '0000' } })).status === 400, 'wrong code → 400');
const add = await call('POST', '/client/application/add', { ...body, Otp: { ID: s.json.Data.ID, UID: s.json.Data.UID, Code: code } });
ok(add.status === 200 && add.json.Data.ID && add.json.Data.UID, 'application sent', add.json);
const app = add.json.Data;

// the confirmed phone and the personal data went to the account
const u = await prisma.user.findFirst({ where: { email } });
ok(u.phone === phone, 'confirmed phone saved on the account');
const prof = (await call('GET', `/client/profile/detail/${me.Profile.ID}/${me.Profile.UID}`)).json.Data;
ok(prof.Customer?.Pid === body.Pid && prof.Customer.FirstName === 'ტესტ' && prof.Customer.CityID === Number(city.id), 'profile filled from the first application', prof);

// a second application with the account's own phone needs no code
const add2 = await call('POST', '/client/application/add', { ...body, Amount: 7000, OrganizationIDs: [accepting[0].ID] });
ok(add2.status === 200, 'second application with the account phone: no code needed', add2.json);

// ── my applications
const active = (await call('POST', '/client/application/find/1/10', { Filter: { State: 'active' } })).json.Data;
ok(active.TotalCount === 2 && active.Counts.Active === 2 && active.Counts.Done === 0, 'find: 2 active, 0 done', active.Counts);
const first = active.Items.find((a) => a.ID === app.ID);
ok(first.Orgs.length === 2 && first.Orgs.every((o) => o.Status === 'sent' && o.ExpiresOn && o.Organization.NameKa), 'each organisation: sent, with a deadline');
const det = (await call('GET', `/client/application/detail/${app.ID}/${app.UID}`)).json.Data;
ok(det.Orgs.every((o) => o.Next.includes('declined') && !o.Next.includes('accepted')), 'detail: next steps for the customer (decline only while sent)');

// partner makes an offer (directly in the database — the partner API has its own suite)
const [o1, o2] = det.Orgs;
await prisma.applicationOrg.update({ where: { id: BigInt(o1.ID) }, data: { status: 'offer', statusOn: new Date() } });
await prisma.offer.create({ data: { applicationOrgId: BigInt(o1.ID), amount: 5000, currency: 'GEL', months: 24, rate: 14, fee: 50, insMonth: 15 } });
const chg = (o, st) => call('PUT', `/client/applicationOrg/changeStatus/${o.ID}/${o.UID}`, { Status: st });
ok((await chg(o2, 'accepted')).status === 409, 'cannot accept without an offer (409)');
const closedBefore = await prisma.applicationOrg.findUnique({ where: { id: BigInt(o1.ID) } });
ok(closedBefore.contactsOpenedOn === null, 'before accepting: the partner has no contacts');
ok((await chg(o1, 'accepted')).status === 200, 'accept the offer');
const openedAfter = await prisma.applicationOrg.findUnique({ where: { id: BigInt(o1.ID) } });
const other = await prisma.applicationOrg.findUnique({ where: { id: BigInt(o2.ID) } });
ok(openedAfter.contactsOpenedOn !== null && other.contactsOpenedOn === null, 'accepting opens the contacts to that organisation only');
const det2 = (await call('GET', `/client/application/detail/${app.ID}/${app.UID}`)).json.Data;
const ev = await prisma.statusEvent.findFirst({ where: { applicationOrgId: BigInt(o1.ID) }, orderBy: { id: 'desc' } });
ok(det2.Orgs.find((o) => o.ID === o1.ID).Status === 'accepted' && det2.Orgs.find((o) => o.ID === o1.ID).Offers.length === 1 && ev.actor === 'customer', 'accepted, offer visible, history by the customer');

// close the whole application: the rest moves to the customer's cancel status
ok((await call('PUT', `/client/application/cancel/${app.ID}/${app.UID}`)).status === 200, 'close the application');
const det3 = (await call('GET', `/client/application/detail/${app.ID}/${app.UID}`)).json.Data;
ok(det3.Orgs.every((o) => o.Status === 'declined'), 'every organisation in progress → declined', det3.Orgs.map((o) => o.Status));
ok((await call('PUT', `/client/application/cancel/${app.ID}/${app.UID}`)).status === 409, 'closing again → 409');
const counts = (await call('POST', '/client/application/find/1/10', { Filter: { State: 'done' } })).json.Data;
ok(counts.Counts.Active === 1 && counts.Counts.Done === 1 && counts.Items[0].ID === app.ID, 'closed application moves to "done"', counts.Counts);

// ── several offers answered together (the customer ticks them, then accepts / cancels all at once)
const add3 = await call('POST', '/client/application/add', { ...body, Amount: 8000 });
const app3 = (await call('GET', `/client/application/detail/${add3.json.Data.ID}/${add3.json.Data.UID}`)).json.Data;
const [p1, p2] = app3.Orgs;
await prisma.applicationOrg.update({ where: { id: BigInt(p1.ID) }, data: { status: 'offer' } });
const respond = (b) => call('PUT', `/client/application/respond/${app3.ID}/${app3.UID}`, b);
ok((await respond({ Status: 'accepted', ApplicationOrgIDs: [p1.ID, p2.ID] })).status === 409, 'one of them has no offer → 409, nothing changes');
ok((await prisma.applicationOrg.findUnique({ where: { id: BigInt(p1.ID) } })).status === 'offer', 'all or none: the valid one did not move either');
ok((await respond({ Status: 'accepted', ApplicationOrgIDs: [] })).status === 400, 'nothing ticked → 400');
ok((await respond({ Status: 'accepted', ApplicationOrgIDs: [o1.ID] })).status === 400, "another application's record → 400");
await prisma.applicationOrg.update({ where: { id: BigInt(p2.ID) }, data: { status: 'offer' } });
const both = await respond({ Status: 'accepted', ApplicationOrgIDs: [p1.ID, p2.ID] });
const after3 = await prisma.applicationOrg.findMany({ where: { id: { in: [BigInt(p1.ID), BigInt(p2.ID)] } } });
ok(both.status === 200 && after3.every((x) => x.status === 'accepted' && x.contactsOpenedOn), 'both accepted together, contacts opened for both', both.json);

// ── profile
const edit = await call('PUT', `/client/profile/edit/${me.Profile.ID}/${me.Profile.UID}`, { UserName: 'tester', Pid: '01001012345', FirstName: 'ტესტი', LastName: 'კლიენტი', BirthDate: '1990-05-01', CityID: Number(city.id), DistrictID: null, Village: null });
const prof2 = (await call('GET', `/client/profile/detail/${me.Profile.ID}/${me.Profile.UID}`)).json.Data;
ok(edit.status === 200 && prof2.User.UserName === 'tester' && prof2.Customer.FirstName === 'ტესტი', 'profile edit');
ok((await call('PUT', `/client/profile/edit/${me.Profile.ID}/${me.Profile.UID}`, { Pid: '123' })).status === 400, 'profile: personal number 11 digits');
const newPhone = `5${String(Number(stamp) + 1).padStart(8, '0').slice(-8)}`;
const ps = await call('POST', '/client/profile/sendPhoneOtp', { Phone: newPhone });
const pcode = await otpFromLog(newPhone);
const pc = await call('PUT', `/client/profile/changePhone/${me.Profile.ID}/${me.Profile.UID}`, { Phone: newPhone, Otp: { ID: ps.json.Data.ID, UID: ps.json.Data.UID, Code: pcode } });
ok(pc.status === 200 && (await prisma.user.findFirst({ where: { email } })).phone === newPhone, 'phone change with an SMS code');
const taken = await prisma.user.findFirst({ where: { phone: { not: null }, NOT: { email } } });
if (taken) ok((await call('POST', '/client/profile/sendPhoneOtp', { Phone: taken.phone })).status === 409, 'phone of another account → 409');

// ── another customer sees nothing of this one
forget('client');
await login('client', `other.${stamp}@example.com`);
ok((await call('GET', `/client/application/detail/${app.ID}/${app.UID}`)).status === 404, 'other customer: application not found');
ok((await call('PUT', `/client/applicationOrg/changeStatus/${o2.ID}/${o2.UID}`, { Status: 'declined' })).status === 404, 'other customer: cannot change it');
ok((await call('GET', `/client/profile/detail/${me.Profile.ID}/${me.Profile.UID}`)).status === 404, 'other customer: profile not found');
ok((await call('POST', '/client/application/find/1/10', {})).json.Data.TotalCount === 0, 'other customer: empty list');
forget('client');
ok((await call('POST', '/client/application/find/1/10', {})).status === 401, 'no session → 401');

await prisma.$disconnect();
done();
