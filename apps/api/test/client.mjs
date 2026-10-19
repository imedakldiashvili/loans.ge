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
/** The application with a fresh SMS code for its phone (waits out the resend interval of the previous one). */
const withCode = async (b) => {
  for (let i = 0; i < 15; i++) {
    const r = await call('POST', '/client/application/sendPhoneOtp', { Phone: b.Phone });
    if (r.status === 200) return { ...b, Otp: { ID: r.json.Data.ID, UID: r.json.Data.UID, Code: await otpFromLog(b.Phone) } };
    await new Promise((x) => setTimeout(x, 1000));
  }
  throw new Error('no SMS code');
};
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

// every application needs its own code — also with the account's own phone
ok((await call('POST', '/client/application/add', { ...body, Amount: 7000, OrganizationIDs: [accepting[0].ID] })).status === 400, 'second application with the account phone, no code → 400');
ok((await call('POST', '/client/application/add', { ...body, Amount: 7000, OrganizationIDs: [accepting[0].ID], Otp: { ID: s.json.Data.ID, UID: s.json.Data.UID, Code: code } })).status !== 200, 'a used code does not work again');
const add2 = await call('POST', '/client/application/add', await withCode({ ...body, Amount: 7000, OrganizationIDs: [accepting[0].ID] }));
ok(add2.status === 200, 'second application with the account phone and a new code', add2.json);

// ── my applications
const active = (await call('POST', '/client/application/find/1/10', { Filter: { State: 'active' } })).json.Data;
ok(active.TotalCount === 2 && active.Counts.Active === 2 && active.Counts.Done === 0, 'find: 2 active, 0 done', active.Counts);
const first = active.Items.find((a) => a.ID === app.ID);
ok(first.Orgs.length === 2 && first.Orgs.every((o) => o.Status === 'sent' && o.ExpiresOn && o.Organization.NameKa), 'each organisation: sent, with a deadline');
const det = (await call('GET', `/client/application/detail/${app.ID}/${app.UID}`)).json.Data;
ok(det.Orgs.every((o) => o.Next.includes('withdrawn') && !o.Next.includes('accepted')), 'detail: next steps for the customer (decline only while sent — before an offer: withdrawn)');

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
// an offer → declined; no offer yet → withdrawn
ok(det3.Orgs.every((o) => o.Status === (o.Offers.length ? 'declined' : 'withdrawn')), 'every organisation in progress → declined / withdrawn', det3.Orgs.map((o) => o.Status));
ok((await call('PUT', `/client/application/cancel/${app.ID}/${app.UID}`)).status === 409, 'closing again → 409');
const counts = (await call('POST', '/client/application/find/1/10', { Filter: { State: 'done' } })).json.Data;
ok(counts.Counts.Active === 1 && counts.Counts.Done === 1 && counts.Items[0].ID === app.ID, 'closed application moves to "done"', counts.Counts);

// ── the customer's answer: offers marked "choose" / "cancel" change together on "send"; unmarked ones stay
const add3 = await call('POST', '/client/application/add', await withCode({ ...body, Amount: 8000, OrganizationIDs: accepting.slice(0, 3).map((o) => o.ID) }));
const app3 = (await call('GET', `/client/application/detail/${add3.json.Data.ID}/${add3.json.Data.UID}`)).json.Data;
const [p1, p2, p3] = app3.Orgs;
const makeOffer = async (o) => {
  await prisma.applicationOrg.update({ where: { id: BigInt(o.ID) }, data: { status: 'offer' } });
  await prisma.offer.create({ data: { applicationOrgId: BigInt(o.ID), amount: 8000, currency: 'GEL', months: 24, rate: 14 } });
};
await makeOffer(p1);
await makeOffer(p2);
const offers3first = await prisma.offer.findFirst({ where: { applicationOrgId: BigInt(p1.ID) } });
const respond = (b) => call('PUT', `/client/application/respond/${app3.ID}/${app3.UID}`, b);
const st3 = async () => Object.fromEntries((await prisma.applicationOrg.findMany({ where: { applicationId: BigInt(app3.ID) } })).map((x) => [Number(x.id), x]));
ok((await respond({})).status === 400, 'nothing marked → 400');
ok((await respond({ AcceptIDs: [p1.ID], DeclineIDs: [p1.ID] })).status === 400, 'the same offer in both lists → 400');
ok((await respond({ AcceptIDs: [o1.ID] })).status === 400, "another application's record → 400");
if (p3) ok((await respond({ AcceptIDs: [p1.ID, p3.ID] })).status === 409, 'an organisation without an offer cannot be accepted → 409');
ok((await st3())[p1.ID].status === 'offer', 'all or none: nothing moved');
const r3 = await respond({ AcceptIDs: [p1.ID] });
let s3 = await st3();
ok(r3.status === 200 && s3[p1.ID].status === 'accepted' && s3[p1.ID].contactsOpenedOn, 'marked "choose" → accepted, contacts opened', r3.json);
ok(s3[p2.ID].status === 'offer', 'an unmarked offer stays waiting');
if (p3) ok(s3[p3.ID].status === 'sent', 'organisation without an offer yet is not touched');
// finishing the comparison: the other offers and the organisations still without an offer are cancelled
ok((await respond({ DeclineIDs: [p2.ID, ...(p3 ? [p3.ID] : [])] })).status === 200, 'later: the rest cancelled together');
s3 = await st3();
ok(s3[p2.ID].status === 'declined' && !s3[p2.ID].contactsOpenedOn, '→ cancelled by the customer, contacts stay closed');
if (p3) ok(s3[p3.ID].status === 'withdrawn', 'an organisation that had not sent its offer yet is cancelled too (withdrawn)');

// one organisation, two offers: the customer chooses one of them (OfferIDs)
const add4 = await call('POST', '/client/application/add', await withCode({ ...body, Amount: 9000, OrganizationIDs: accepting.slice(0, 1).map((o) => o.ID) }));
const app4 = (await call('GET', `/client/application/detail/${add4.json.Data.ID}/${add4.json.Data.UID}`)).json.Data;
const [q1] = app4.Orgs;
await makeOffer(q1);
await prisma.offer.create({ data: { applicationOrgId: BigInt(q1.ID), amount: 9000, currency: 'GEL', months: 36, rate: 15 } });
const offers4 = await prisma.offer.findMany({ where: { applicationOrgId: BigInt(q1.ID) }, orderBy: { id: 'asc' } });
const respond4 = (b) => call('PUT', `/client/application/respond/${app4.ID}/${app4.UID}`, b);
ok((await respond4({ AcceptIDs: [q1.ID] })).status === 400, 'two offers: accepting the organisation without naming the offer → 400');
ok((await respond4({ OfferIDs: [Number(offers3first.id)] })).status === 400, "another application's offer → 400");
const r4 = await respond4({ OfferIDs: [Number(offers4[1].id)] });
const chosen4 = await prisma.offer.findMany({ where: { applicationOrgId: BigInt(q1.ID) }, orderBy: { id: 'asc' } });
ok(r4.status === 200 && (await prisma.applicationOrg.findUnique({ where: { id: BigInt(q1.ID) } })).status === 'accepted', 'the chosen offer → its organisation accepted', r4.json);
ok(!chosen4[0].chosenOn && chosen4[1].chosenOn, 'only the chosen offer is marked chosen');
const seen4 = (await call('GET', `/client/application/detail/${app4.ID}/${app4.UID}`)).json.Data.Orgs[0].Offers;
ok(seen4.find((x) => x.ID === Number(offers4[1].id)).ChosenOn && !seen4.find((x) => x.ID === Number(offers4[0].id)).ChosenOn, 'the customer sees which one was chosen');

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

// ── passkeys: what can be checked without a device (the browser creates and signs the key)
await login('client', `passkey.${stamp}@example.com`);
const ro = await call('POST', '/client/passkey/registerOptions');
const regOpts = ro.json?.Data?.OptionsJson && JSON.parse(ro.json.Data.OptionsJson);
ok(ro.status === 200 && regOpts.challenge && regOpts.rp.id === 'localhost' && regOpts.authenticatorSelection.residentKey === 'required', 'passkey: registration options (challenge, site, a key the device keeps)', ro.json);
ok((await call('POST', '/client/passkey/register', { ResponseJson: '{"id":"x"}' })).status === 400, 'passkey: an invalid answer → 400');
ok((await call('POST', '/client/passkey/register', { ResponseJson: '{"id":"x"}' })).status === 400, 'passkey: the challenge is used up — again → 400');
const list = await call('POST', '/client/passkey/find/1/50', {});
ok(list.status === 200 && list.json.Data.TotalCount === 0, 'passkey: list (none yet)');
ok((await call('DELETE', '/client/passkey/delete/999999/00000000-0000-0000-0000-000000000000')).status === 404, "passkey: someone else's / unknown → 404");
const lo = await call('POST', '/public/auth/passkeyOptions', {});
ok(lo.status === 200 && lo.json.Data.ChallengeID && JSON.parse(lo.json.Data.OptionsJson).rpId === 'localhost', 'passkey sign-in: options with a challenge id');
const unknownKey = JSON.stringify({ id: 'AAAA', rawId: 'AAAA', type: 'public-key', response: { clientDataJSON: 'e30', authenticatorData: 'AA', signature: 'AA' }, clientExtensionResults: {} });
ok((await call('POST', '/public/auth/passkeyLogin', { ChallengeID: lo.json.Data.ChallengeID, ResponseJson: unknownKey })).status === 401, 'passkey sign-in: an unknown passkey → 401');
ok((await call('POST', '/public/auth/passkeyLogin', { ChallengeID: lo.json.Data.ChallengeID, ResponseJson: unknownKey })).status === 400, 'passkey sign-in: the challenge is used up → 400');
forget('client');
ok((await call('POST', '/client/passkey/registerOptions')).status === 401, 'passkey: adding needs a signed-in customer (401)');

done();
