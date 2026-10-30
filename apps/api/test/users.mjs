// Group 3 — users and profiles on the admin gateway: user, admin, staff, customer.
// Usage: node test/users.mjs [baseUrl] [apiLogFile]
import { PrismaClient } from '@prisma/client';
import { call, done, login, ok } from './lib.mjs';

const prisma = new PrismaClient();
const stamp = Date.now().toString(36);
const find = (m, body = {}, size = 100) => call('POST', `/admin/${m}/find/1/${size}`, body);

await login('admin', 'admin@loans.ge');
const me = (await call('GET', '/admin/auth/me')).json.Data;

// ── admins
const admins = (await find('admin')).json.Data.Items;
ok(admins.length === 3 && admins.every((a) => a.User.Email && a.Role), 'admin: 3 seeded, with user contacts');
const selfDis = await call('PUT', `/admin/admin/disable/${me.Profile.ID}/${me.Profile.UID}`);
ok(selfDis.status === 409, 'admin: cannot disable yourself');

const newAdmin = await call('POST', '/admin/admin/add', { Email: `ops.${stamp}@loans.ge`, Phone: '577 11 22 33', DisplayName: 'ახალი ოპერატორი', Role: 'operator' });
ok(newAdmin.status === 200, 'admin: add (creates user + admin profile)', newAdmin.json);
const dupAdmin = await call('POST', '/admin/admin/add', { Email: `ops.${stamp}@loans.ge`, DisplayName: 'x', Role: 'analyst' });
ok(dupAdmin.status === 409, 'admin: same user twice → 409');
const noContact = await call('POST', '/admin/admin/add', { DisplayName: 'x', Role: 'analyst' });
ok(noContact.status === 400 && noContact.json.Error.Details[0].Field === 'Email', 'admin: email required (staff log in by email only)');
const newUser = await prisma.user.findFirst({ where: { email: `ops.${stamp}@loans.ge` } });
ok(newUser?.phone === '577112233' && newUser.createdBy === BigInt(me.User.ID), 'admin: phone normalised, CreatedBy = current admin');
const lastDel = await call('DELETE', `/admin/admin/delete/${newAdmin.json.Data.ID}/${newAdmin.json.Data.UID}`);
ok(lastDel.status === 409, 'admin: the last profile of a user cannot be deleted');
const edAdmin = await call('PUT', `/admin/admin/edit/${newAdmin.json.Data.ID}/${newAdmin.json.Data.UID}`, { Email: `ops.${stamp}@loans.ge`, Phone: '577112233', DisplayName: 'ანალიტიკოსი', Role: 'analyst' });
const det = (await call('GET', `/admin/admin/detail/${newAdmin.json.Data.ID}/${newAdmin.json.Data.UID}`)).json.Data;
ok(edAdmin.status === 200 && det.Role === 'analyst' && det.DisplayName === 'ანალიტიკოსი', 'admin: edit role');

// the new admin can log in, as analyst
const l = await login('admin', `ops.${stamp}@loans.ge`);
ok(l.verify?.status === 200, 'new admin logs in by email');
ok((await call('POST', '/admin/admin/add', { Email: `x.${stamp}@loans.ge`, DisplayName: 'x', Role: 'super' })).status === 403, 'analyst cannot add admins');
await login('admin', 'admin@loans.ge'); // back to super

// ── staff
const bankA = (await find('organization', { Filter: { Search: 'საქართველოს ბანკი' } })).json.Data.Items[0];
const bankG = (await find('organization', { Filter: { Search: 'ტერაბანკი' } })).json.Data.Items[0];
const staffA = (await find('staff', { Filter: { OrganizationID: bankA.ID } })).json.Data.Items;
ok(staffA.length === 4 && staffA[0].Organization.NameKa === 'საქართველოს ბანკი', 'staff: filter by organisation');
const notPartner = await call('POST', '/admin/staff/add', { Email: `s.${stamp}@g.ge`, DisplayName: 'x', OrganizationID: bankG.ID, Role: 'sales' });
ok(notPartner.status === 400 && notPartner.json.Error.Details[0].Field === 'OrganizationID', 'staff: organisation must be a partner');
const tbilisi = (await find('city', { Filter: { Search: 'თბილისი' } })).json.Data.Items[0];
const st = await call('POST', '/admin/staff/add', { Email: `s.${stamp}@a.ge`, DisplayName: 'ახალი გაყიდვები', OrganizationID: bankA.ID, Role: 'sales', ScopeCities: [tbilisi.ID] });
const stDet = (await call('GET', `/admin/staff/detail/${st.json.Data.ID}/${st.json.Data.UID}`)).json.Data;
ok(st.status === 200 && stDet.ScopeCities[0] === tbilisi.ID && stDet.Role === 'sales', 'staff: add with city scope', st.json);
await call('PUT', `/admin/staff/edit/${st.json.Data.ID}/${st.json.Data.UID}`, { Email: `s.${stamp}@a.ge`, DisplayName: 'back office', OrganizationID: bankA.ID, Role: 'back', ScopeCities: [tbilisi.ID] });
const stBack = (await call('GET', `/admin/staff/detail/${st.json.Data.ID}/${st.json.Data.UID}`)).json.Data;
ok(stBack.Role === 'back' && stBack.ScopeCities.length === 0, 'staff: back role has no scope');
// the same person in a second organisation
const bankB = (await find('organization', { Filter: { Search: 'თიბისი ბანკი' } })).json.Data.Items[0];
const st2 = await call('POST', '/admin/staff/add', { Email: `s.${stamp}@a.ge`, DisplayName: 'იგივე პირი', OrganizationID: bankB.ID, Role: 'sales' });
ok(st2.status === 200, 'staff: same user in another organisation → second staff profile');
const p = await login('partner', `s.${stamp}@a.ge`);
const pme = (await call('GET', '/partner/auth/me')).json.Data;
ok(p.verify.status === 200 && pme.Profiles.length === 2, 'partner: two organisations → two profiles to choose from');
const other = pme.Profiles.find((x) => x.ID !== pme.Profile.ID);
const sw = await call('PUT', `/partner/auth/switchProfile/${other.ID}/${other.UID}`);
const pme2 = (await call('GET', '/partner/auth/me')).json.Data;
ok(sw.status === 200 && pme2.Profile.ID === other.ID, 'partner: switch profile (organisation)');

// ── customers
const cust = (await find('customer', { Filter: { Search: 'ბერიძე' } })).json.Data.Items;
ok(cust.length >= 1 && cust[0].Customer && cust[0].User, 'customer: search by last name with details');
ok((await call('POST', '/admin/customer/add', {})).status === 404, 'customer: add is not offered');
const c0 = cust[0];
ok((await call('PUT', `/admin/customer/disable/${c0.ID}/${c0.UID}`)).status === 200, 'customer: disable');
await call('PUT', `/admin/customer/enable/${c0.ID}/${c0.UID}`);

// ── users
const u = (await find('user', { Filter: { Search: `s.${stamp}@a.ge` } })).json.Data.Items[0];
ok(u && u.Profiles.length === 2, 'user: one person, profiles listed');
ok((await call('DELETE', `/admin/user/delete/${u.ID}/${u.UID}`)).status === 404, 'user: delete is not offered');
const selfUser = await call('PUT', `/admin/user/disable/${me.User.ID}/${me.User.UID}`);
ok(selfUser.status === 409, 'user: cannot disable yourself');
ok((await call('PUT', `/admin/user/disable/${u.ID}/${u.UID}`)).status === 200, 'user: disable');
ok((await call('GET', '/partner/auth/me')).status === 401, 'disabled user loses the session immediately');
await call('PUT', `/admin/user/enable/${u.ID}/${u.UID}`);

await prisma.$disconnect();
done();
