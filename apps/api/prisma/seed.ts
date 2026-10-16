// Seeds the database with the prototype demo data (prisma/seed-data/prototype.json, extracted from prototype/admin.html).
// Safe to re-run: clears the tables first. Development only.
import { PrismaClient, Prisma } from '@prisma/client';
import { DEFAULT_STATUS_CONFIG } from '@loans/shared';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();
const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'seed-data/prototype.json'), 'utf8'));

const CATEGORY: Record<string, string> = { 'ბანკი': 'bank', 'მიკროსაფინანსო': 'mfo', 'სალიზინგო': 'leasing', 'სესხის გამცემი სუბიექტი': 'lender' };
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const phoneNorm = (p: string) => p.replace(/\D/g, '').replace(/^995/, '');
const amountNum = (s: string) => Number(String(s).replace(/[^\d.]/g, ''));

async function clear() {
  // children first
  const tables = [
    'action_log_response', 'action_log_request', 'action_log',
    'status_event', 'offer', 'application_org', 'application',
    'session', 'oauth_identity', 'customer_detail', 'user_profile', 'otp_challenge', 'user', 'profile_type',
    'partner_offer_card', 'partner_product', 'organization_product_type', 'organization',
    'product_type_field', 'product_type', 'reference_item', 'district', 'city', 'region', 'currency',
    'status_transition', 'status', 'setting',
  ];
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`);
}

async function main() {
  await clear();
  const refs = data.refs;

  // ── reference data
  for (const c of refs.currencies) await prisma.currency.create({ data: { code: c.code, symbol: c.sym, sort: c.sort } });

  const cityId = new Map<string, bigint>();
  for (const [regionKa, cities] of Object.entries<any[]>(refs.regions)) {
    const region = await prisma.region.create({
      data: { code: refs.regionCode?.[regionKa] ?? slug(refs.regionEn[regionKa]), nameKa: regionKa, nameEn: refs.regionEn[regionKa], sort: refs.regionSort[regionKa] ?? 0 },
    });
    for (const c of cities) {
      const city = await prisma.city.create({ data: { regionId: region.id, code: c.code, nameKa: c.ka, nameEn: c.en, sort: c.sort } });
      cityId.set(c.ka, city.id);
    }
  }
  const districtId = new Map<string, bigint>();
  for (const [cityKa, list] of Object.entries<any[]>(refs.districts)) {
    const cid = cityId.get(cityKa);
    if (!cid) continue;
    for (const d of list) {
      const row = await prisma.district.create({ data: { cityId: cid, code: d.code, nameKa: d.ka, nameEn: d.en, sort: d.sort } });
      districtId.set(`${cityKa}|${d.ka}`, row.id);
    }
  }

  const items = (kind: string, list: any[]) =>
    prisma.referenceItem.createMany({ data: list.map((x, i) => ({ kind, code: x.code ?? slug(x.en), nameKa: x.ka, nameEn: x.en, sort: x.sort ?? (i + 1) * 10 })) });
  await items('offer_type', refs.offerTypes);
  await items('reject_reason', refs.rejectReasons);
  await items('cancel_reason', refs.cancelReasons);
  await items('sector', refs.sectors);
  await items('income_source', refs.incomes);
  await items('credit_history', [
    { code: 'none', ka: 'არ მაქვს', en: 'None' },
    { code: 'positive', ka: 'პოზიტიური', en: 'Positive' },
    { code: 'recovered', ka: 'იყო ნეგატიური, გახდა პოზიტიური', en: 'Was negative, now positive' },
    { code: 'negative', ka: 'ნეგატიური', en: 'Negative' },
  ]);

  // ── product types and their offer field schema
  const productTypeId = new Map<string, bigint>(); // prototype id (pt1…) → db id
  const productTypeByName = new Map<string, bigint>();
  for (const [i, p] of data.productTypes.entries()) {
    const row = await prisma.productType.create({
      data: {
        code: slug(p.nameEn), nameKa: p.name, nameEn: p.nameEn, minAmount: p.min, maxAmount: p.max,
        minMonths: p.noTerm ? null : p.minM || null, maxMonths: p.noTerm ? null : p.maxM || null, noTerm: !!p.noTerm || !p.maxM,
        amountRanges: p.ranges ?? [], sort: p.sort ?? (i + 1) * 10, isEnable: p.active !== false,
        fields: {
          create: p.fields.map((f: any, k: number) => ({
            key: f.key, labelKa: f.label, labelEn: f.labelEn ?? f.label, kind: f.kind,
            defaultValue: f.def === undefined ? Prisma.JsonNull : f.def, step: f.step ?? null,
            options: f.options ? f.options : Prisma.JsonNull, sort: (k + 1) * 10,
          })),
        },
      },
    });
    productTypeId.set(p.id, row.id);
    productTypeByName.set(p.name, row.id);
  }

  // ── organisations
  const orgId = new Map<string, bigint>(); // prototype id → db id
  const orgByName = new Map<string, bigint>();
  for (const o of data.orgs) {
    const row = await prisma.organization.create({
      data: {
        nameKa: o.name, nameEn: o.nameEn, category: CATEGORY[o.cat] ?? 'bank', color: o.color, isPartner: o.partner !== false,
        sort: o.sort, isEnable: o.active !== false,
        productTypes: { create: (o.products ?? []).filter((id: string) => productTypeId.has(id)).map((id: string) => ({ productTypeId: productTypeId.get(id)! })) },
      },
    });
    orgId.set(o.id, row.id);
    orgByName.set(o.name, row.id);
  }

  // ── statuses and transitions (packages/shared defaults)
  const statusId = new Map<string, bigint>();
  for (const s of DEFAULT_STATUS_CONFIG.statuses) {
    const row = await prisma.status.create({
      data: {
        key: s.key, customerKa: s.labels.customerKa, customerEn: s.labels.customerEn, partnerLabel: s.labels.partner, chipLabel: s.labels.chip,
        category: s.category, ttlMinutes: s.ttlMinutes, sort: s.sort, hidesPersonalData: !!s.flags.hidesPersonalData,
        requiresOffer: !!s.flags.requiresOffer, requiresIssued: !!s.flags.requiresIssued, isExpiryTarget: !!s.flags.isExpiryTarget,
      },
    });
    statusId.set(s.key, row.id);
  }
  await prisma.statusTransition.createMany({
    data: DEFAULT_STATUS_CONFIG.transitions.map((t) => ({ fromStatusId: statusId.get(t.from)!, toStatusId: statusId.get(t.to)!, actor: t.by, reasonKind: t.reasonKind })),
  });

  // ── settings
  await prisma.setting.createMany({
    data: [
      {
        key: 'otp',
        value: {
          sms: { on: true, len: data.settings.otpLen ?? 4, ttl: 120, tries: 3, resend: 60, sender: 'loans.ge', tpl: 'loans.ge: თქვენი კოდია {code}' },
          email: { on: true, len: data.settings.otpLen ?? 4, ttl: 300, tries: 3, resend: 60, sender: data.settings.email ?? 'support@loans.ge', tpl: 'loans.ge — ერთჯერადი კოდი: {code}' },
        },
      },
      { key: 'contacts', value: { phone: data.settings.phone, email: data.settings.email } },
    ],
  });

  // ── profile types and users
  const pt = {
    customer: await prisma.profileType.create({ data: { code: 'customer', nameKa: 'მსესხებელი', nameEn: 'Customer' } }),
    staff: await prisma.profileType.create({ data: { code: 'staff', nameKa: 'ორგანიზაციის თანამშრომელი', nameEn: 'Organisation staff' } }),
    admin: await prisma.profileType.create({ data: { code: 'admin', nameKa: 'ადმინისტრატორი', nameEn: 'Administrator' } }),
  };

  /** Finds a user by email/phone or creates one; then adds the profile. */
  const userFor = async (email: string | null, phone: string | null, userName: string | null, verified = false) => {
    const or: Prisma.UserWhereInput[] = [];
    if (email) or.push({ email });
    if (phone) or.push({ phone });
    const found = or.length ? await prisma.user.findFirst({ where: { OR: or } }) : null;
    return found ?? prisma.user.create({ data: { email, phone, userName, isVerified: verified } });
  };

  for (const a of data.admins) {
    const u = await userFor(a.email, phoneNorm(a.phone), a.name, true);
    await prisma.userProfile.create({ data: { userId: u.id, profileTypeId: pt.admin.id, role: a.role, displayName: a.name, isEnable: a.active !== false } });
  }

  for (const s of data.staff) {
    const oid = orgId.get(s.org);
    if (!oid) continue;
    for (const m of s.list) {
      const u = await userFor(m.email, phoneNorm(m.phone), m.name, true);
      const cities = (m.cities ?? []).map((c: string) => cityId.get(c)).filter(Boolean) as bigint[];
      await prisma.userProfile.create({
        data: { userId: u.id, profileTypeId: pt.staff.id, organizationId: oid, role: m.role, displayName: m.name, scopeCities: cities, isEnable: m.active !== false },
      });
    }
  }

  const customerProfile = new Map<string, bigint>(); // email → user id
  const ensureCustomer = async (email: string, name: string, phone: string, verified: boolean, extra: Partial<Prisma.CustomerDetailUncheckedCreateInput> = {}) => {
    if (customerProfile.has(email)) return customerProfile.get(email)!;
    const u = await userFor(email, phone ? phoneNorm(phone) : null, name, verified);
    const [firstName, ...rest] = name.split(' ');
    await prisma.userProfile.create({
      data: { userId: u.id, profileTypeId: pt.customer.id, displayName: name, customer: { create: { firstName, lastName: rest.join(' ') || null, ...extra } } },
    });
    customerProfile.set(email, u.id);
    return u.id;
  };
  for (const c of data.customers) await ensureCustomer(c.email, c.name, c.phone, !!c.verified, { cityId: cityId.get(c.city) ?? null });

  // ── demo applications (orgList → application_org, terms → offer, log → status_event)
  for (const a of data.demoApps) {
    const userId = await ensureCustomer(a.email, a.name, a.phone, true, { pid: a.pid, cityId: cityId.get(a.city) ?? null });
    const [firstName, ...rest] = a.name.split(' ');
    const app = await prisma.application.create({
      data: {
        userId, createdBy: userId, createdOn: new Date(a.date), productTypeId: productTypeByName.get(a.loan)!, amount: amountNum(a.amount), currency: 'GEL', source: a.source ?? null,
        pid: a.pid, firstName, lastName: rest.join(' '), birthDate: a.dob ? new Date(a.dob) : null, phone: phoneNorm(a.phone), email: a.email,
        cityId: cityId.get(a.city) ?? null, districtId: a.district ? districtId.get(`${a.city}|${a.district}`) ?? null : null,
        creditHistory: a.credit, sector: a.sector, incomes: a.incomes ?? Prisma.JsonNull, banks: a.banks ?? Prisma.JsonNull,
      },
    });
    for (const o of a.orgList) {
      const oid = orgByName.get(o.name);
      if (!oid) continue;
      const ttl = DEFAULT_STATUS_CONFIG.statuses.find((s) => s.key === o.status)?.ttlMinutes;
      const ao = await prisma.applicationOrg.create({
        data: {
          applicationId: app.id, organizationId: oid, status: o.status, createdOn: new Date(o.sentAt), sentOn: new Date(o.sentAt),
          statusOn: new Date(o.statusAt), offerOn: o.offerAt ? new Date(o.offerAt) : null,
          expiresOn: ttl ? new Date(o.statusAt + ttl * 60_000) : null, reasonText: o.reason ?? null,
          issued: o.status === 'done', issuedOn: o.status === 'done' ? new Date(o.statusAt) : null,
        },
      });
      if (o.terms) {
        await prisma.offer.create({
          data: { applicationOrgId: ao.id, createdOn: new Date(o.offerAt ?? o.statusAt), amount: o.terms.amount, currency: 'GEL', months: o.terms.months, rate: o.terms.rate, fee: o.terms.fee ?? 0, insMonth: o.terms.insMonth ?? 0 },
        });
      }
      let prev: string | null = null;
      for (const e of o.log ?? []) {
        const actor = /^მომხმარებელი/.test(e.by) ? 'customer' : e.by === 'სისტემა' ? 'system' : 'partner';
        await prisma.statusEvent.create({ data: { applicationOrgId: ao.id, fromStatus: prev, toStatus: e.status, actor, createdOn: new Date(e.at) } });
        prev = e.status;
      }
    }
  }

  const count = async (name: string, fn: () => Promise<number>) => [name, await fn()] as const;
  console.table(Object.fromEntries(await Promise.all([
    count('currency', () => prisma.currency.count()), count('city', () => prisma.city.count()), count('district', () => prisma.district.count()),
    count('reference_item', () => prisma.referenceItem.count()), count('product_type', () => prisma.productType.count()),
    count('product_type_field', () => prisma.productTypeField.count()), count('organization', () => prisma.organization.count()),
    count('status', () => prisma.status.count()), count('status_transition', () => prisma.statusTransition.count()),
    count('user', () => prisma.user.count()), count('user_profile', () => prisma.userProfile.count()),
    count('application', () => prisma.application.count()), count('application_org', () => prisma.applicationOrg.count()),
    count('offer', () => prisma.offer.count()), count('status_event', () => prisma.statusEvent.count()),
  ])));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
