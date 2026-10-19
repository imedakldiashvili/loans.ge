import { Body, Controller, Get, Injectable, Param, ParseIntPipe, Post, Put } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { parseLogin } from '../auth/auth.service';
import { OtpService } from '../auth/otp.service';
import { parse } from '../core/crud';
import { AppError, conflict, notFound, validation } from '../core/errors';
import { PrismaService } from '../core/prisma.service';
import { currentContext, currentUserId } from '../core/request-context';
import { StatusConfigService } from '../core/status-config';
import { EventsService } from '../events/events';

// Client gateway — the customer's own applications (prototype loans-ge.html: wizard, cabinet, compare).
// An application goes to several organisations; each organisation has its own record and status.
// The customer may accept an offer, decline / cancel per organisation, or close the whole application.

const PAGE_MAX = 50;
const me = () => {
  const id = currentUserId();
  if (!id) throw new AppError('UNAUTHORIZED', 'საჭიროა ავტორიზაცია');
  return id;
};
const phoneOf = (s: string) => {
  const r = parseLogin(s);
  if (r.channel !== 'sms') throw validation([{ field: 'Phone', message: '9 ციფრი, იწყება 5-ით' }]);
  return r.target;
};
const otpRef = z.object({ id: z.coerce.bigint(), uid: z.string().uuid(), code: z.string().trim().regex(/^\d{4,6}$/, '4–6 ციფრი') });

const addSchema = z.object({
  productTypeId: z.coerce.bigint(),
  amount: z.number().positive(),
  currency: z.string().trim().toUpperCase().length(3),
  creditHistory: z.string().trim().min(1, 'აირჩიე საკრედიტო ისტორია'),
  sector: z.string().trim().min(1, 'აირჩიე საქმიანობის სფერო'),
  incomes: z.array(z.object({ src: z.string().trim().min(1), amount: z.number().min(0) })).min(1, 'მინიმუმ ერთი შემოსავლის წყარო'),
  banks: z.array(z.string().trim().min(1)).default([]),
  organizationIds: z.array(z.coerce.bigint()).min(1, 'აირჩიე მინიმუმ ერთი ორგანიზაცია'),
  pid: z.string().trim().regex(/^\d{11}$/, '11 ციფრი'),
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  birthDate: z.coerce.date(),
  phone: z.string().trim(),
  cityId: z.coerce.bigint(),
  districtId: z.coerce.bigint().nullable().default(null),
  village: z.string().trim().max(100).nullable().default(null),
  /** SMS code for the phone in the application (not needed when it is the account's own, already confirmed phone) */
  otp: otpRef.nullable().default(null),
});

const findBody = z.preprocess((v) => v ?? {}, z.object({ filter: z.preprocess((v) => v ?? {}, z.object({ state: z.enum(['active', 'done']).default('active') })) }));
const changeBody = z.object({ status: z.string().min(1) });
// OfferIDs — the chosen offers (an organisation may have sent several); AcceptIDs — organisations (their only offer is chosen);
// DeclineIDs — organisations to cancel
const respondBody = z.object({
  offerIds: z.array(z.coerce.bigint()).default([]),
  acceptIds: z.array(z.coerce.bigint()).default([]),
  declineIds: z.array(z.coerce.bigint()).default([]),
});

const orgSelect = { select: { id: true, uid: true, nameKa: true, nameEn: true, category: true, color: true, logoPath: true } };
const include = {
  productType: { select: { id: true, code: true, nameKa: true, nameEn: true } },
  orgs: {
    where: { isDeleted: false },
    orderBy: { id: 'asc' as const },
    include: { organization: orgSelect, offers: { where: { isDeleted: false }, orderBy: { createdOn: 'asc' as const } } },
  },
};

@Injectable()
export class ClientApplicationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly statuses: StatusConfigService,
    private readonly otp: OtpService,
    private readonly events: EventsService,
  ) {}

  private async progressKeys() {
    return (await this.prisma.status.findMany({ where: { isDeleted: false, category: 'progress' }, select: { key: true } })).map((s) => s.key);
  }

  /** Status a new record starts in: the first enabled "progress" status. */
  private async initialStatus() {
    const s = await this.prisma.status.findFirst({ where: { isDeleted: false, isEnable: true, category: 'progress' }, orderBy: { sort: 'asc' } });
    if (!s) throw new AppError('INTERNAL_ERROR', 'საწყისი სტატუსი არ არის');
    return s.key;
  }

  /** Step before sending: SMS code to the phone given in the application. */
  async sendPhoneOtp(body: unknown) {
    const { phone } = parse(z.object({ phone: z.string().trim() }), body);
    return this.otp.send('sms', phoneOf(phone), `apply:${me()}`);
  }

  async add(body: unknown) {
    const d = parse(addSchema, body);
    const userId = me();
    const phone = phoneOf(d.phone);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    // the phone is confirmed with an SMS code sent for this application — every time, also the account's own phone
    if (!d.otp) throw validation([{ field: 'Otp', message: 'დაადასტურე მობილური ნომერი კოდით' }]);
    const ch = await this.otp.verify(d.otp.id, d.otp.uid, d.otp.code);
    if (ch.purpose !== `apply:${userId}` || ch.target !== phone) throw validation([{ field: 'Otp', message: 'კოდი ამ ნომერს არ ეკუთვნის' }]);

    const pt = await this.prisma.productType.findFirst({ where: { id: d.productTypeId, isDeleted: false, isEnable: true } });
    if (!pt) throw validation([{ field: 'ProductTypeID', message: 'პროდუქტი ვერ მოიძებნა' }]);
    if (d.amount < Number(pt.minAmount) || d.amount > Number(pt.maxAmount)) throw validation([{ field: 'Amount', message: `თანხა ${Number(pt.minAmount)}–${Number(pt.maxAmount)}` }]);
    if (!(await this.prisma.currency.count({ where: { code: d.currency, isDeleted: false, isEnable: true } }))) throw validation([{ field: 'Currency', message: 'უცნობი ვალუტა' }]);
    if (!(await this.prisma.city.count({ where: { id: d.cityId, isDeleted: false } }))) throw validation([{ field: 'CityID', message: 'ქალაქი ვერ მოიძებნა' }]);
    if (d.districtId && !(await this.prisma.district.count({ where: { id: d.districtId, cityId: d.cityId, isDeleted: false } }))) {
      throw validation([{ field: 'DistrictID', message: 'უბანი ამ ქალაქს არ ეკუთვნის' }]);
    }
    // only partner organisations that accept this product type
    const ids = [...new Set(d.organizationIds.map(String))].map(BigInt);
    const orgs = await this.prisma.organization.findMany({
      where: { id: { in: ids }, isDeleted: false, isEnable: true, isPartner: true, productTypes: { some: { productTypeId: pt.id, isDeleted: false } } },
      select: { id: true },
    });
    if (orgs.length !== ids.length) throw validation([{ field: 'OrganizationIDs', message: 'ორგანიზაცია ამ პროდუქტზე განაცხადს არ იღებს' }]);

    const m = await this.statuses.machine();
    const initial = await this.initialStatus();
    const now = new Date();
    const ruid = currentContext()?.uid ?? null;
    const created: { id: bigint; organizationId: bigint }[] = [];
    const app = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const a = await tx.application.create({
        data: {
          userId, createdBy: userId, productTypeId: pt.id, amount: d.amount, currency: d.currency, source: 'web',
          pid: d.pid, firstName: d.firstName, lastName: d.lastName, birthDate: d.birthDate, phone, email: user.email,
          cityId: d.cityId, districtId: d.districtId, village: d.village,
          creditHistory: d.creditHistory, sector: d.sector, incomes: d.incomes, banks: d.banks,
        },
      });
      for (const o of orgs) {
        const ao = await tx.applicationOrg.create({
          data: { applicationId: a.id, organizationId: o.id, status: initial, statusOn: now, sentOn: now, expiresOn: m.expiresAt(initial, now), createdBy: userId },
        });
        await tx.statusEvent.create({ data: { applicationOrgId: ao.id, fromStatus: null, toStatus: initial, actor: 'customer', createdBy: userId, requestUid: ruid } });
        created.push({ id: ao.id, organizationId: o.id });
      }
      // the profile is filled from the first application (fields already set stay as they are)
      const profileId = currentContext()?.userProfileId;
      if (profileId) {
        const cd = await tx.customerDetail.findUnique({ where: { userProfileId: profileId } });
        const fill = {
          pid: cd?.pid ?? d.pid, firstName: cd?.firstName ?? d.firstName, lastName: cd?.lastName ?? d.lastName, birthDate: cd?.birthDate ?? d.birthDate,
          cityId: cd?.cityId ?? d.cityId, districtId: cd?.cityId ? cd.districtId : d.districtId, village: cd?.cityId ? cd.village : d.village,
        };
        await tx.customerDetail.upsert({ where: { userProfileId: profileId }, create: { userProfileId: profileId, createdBy: userId, ...fill }, update: { ...fill, updatedBy: userId, updatedOn: now } });
      }
      // a confirmed phone becomes the account's phone if it has none (and nobody else uses it)
      if (!user.phone && !(await tx.user.count({ where: { phone, isDeleted: false } }))) await tx.user.update({ where: { id: userId }, data: { phone } });
      return a;
    });
    // live update: every chosen organisation gets the new application
    for (const c of created) {
      this.events.publish({ type: 'application.created', applicationId: app.id, applicationOrgId: c.id, organizationId: c.organizationId, userId, cityId: d.cityId, productTypeId: pt.id, status: initial, actor: 'customer' });
    }
    return { id: app.id, uid: app.uid };
  }

  async find(pageNumber: number, pageSize: number, body: unknown) {
    if (pageNumber < 1 || pageSize < 1 || pageSize > PAGE_MAX) throw validation([{ field: 'PageSize', message: `1-დან ${PAGE_MAX}-მდე` }]);
    const { filter } = parse(findBody, body);
    const progress = await this.progressKeys();
    const base: Prisma.ApplicationWhereInput = { userId: me(), isDeleted: false };
    // active while at least one organisation is still in progress
    const active: Prisma.ApplicationWhereInput = { ...base, orgs: { some: { isDeleted: false, status: { in: progress } } } };
    const done: Prisma.ApplicationWhereInput = { ...base, NOT: { orgs: { some: { isDeleted: false, status: { in: progress } } } } };
    const where = filter.state === 'active' ? active : done;
    const [items, totalCount, nActive, nDone] = await Promise.all([
      this.prisma.application.findMany({ where, include, orderBy: { createdOn: 'desc' }, skip: (pageNumber - 1) * pageSize, take: pageSize }),
      this.prisma.application.count({ where }),
      this.prisma.application.count({ where: active }),
      this.prisma.application.count({ where: done }),
    ]);
    const m = await this.statuses.machine();
    // per organisation: what the customer can do next (buttons in the cabinet)
    const withNext = items.map((a) => ({ ...a, orgs: a.orgs.map((o) => ({ ...o, next: m.nextStatuses(o.status, 'customer') })) }));
    return { items: withNext, pageNumber, pageSize, totalCount, totalPages: Math.ceil(totalCount / pageSize), counts: { active: nActive, done: nDone } };
  }

  private async load(id: number, uid: string) {
    const row = await this.prisma.application.findFirst({ where: { id: BigInt(id), uid, userId: me(), isDeleted: false }, include });
    if (!row) throw notFound('განაცხადი');
    return row;
  }

  async detail(id: number, uid: string) {
    const row = await this.load(id, uid);
    const m = await this.statuses.machine();
    // what the customer can do with each organisation's record
    const orgs = row.orgs.map((o) => ({ ...o, next: m.nextStatuses(o.status, 'customer') }));
    return { ...row, orgs };
  }

  /** Closes the whole application: every organisation still in progress moves to the customer's cancel status. */
  async cancel(id: number, uid: string) {
    const row = await this.load(id, uid);
    const m = await this.statuses.machine();
    const todo = row.orgs
      .filter((o) => m.categoryOf(o.status) === 'progress')
      .map((o) => ({ o, to: m.nextStatuses(o.status, 'customer').find((k) => m.categoryOf(k) === 'canceled') }))
      .filter((x): x is { o: (typeof row.orgs)[number]; to: string } => !!x.to);
    if (!todo.length) throw conflict('განაცხადი უკვე დასრულებულია');
    const now = new Date();
    const by = me();
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      for (const { o, to } of todo) await this.move(tx, o, to, now, by);
    });
    for (const { o, to } of todo) this.announce(row, o, to);
    return { id: row.id, uid: row.uid };
  }

  private async move(tx: Prisma.TransactionClient, o: { id: bigint; status: string }, to: string, now: Date, by: bigint) {
    const m = await this.statuses.machine();
    await tx.applicationOrg.update({ where: { id: o.id }, data: { status: to, statusOn: now, expiresOn: m.expiresAt(to, now), updatedBy: by, updatedOn: now } });
    // e.g. the customer accepted the offer → the partner gets the phone / e-mail (once, for good)
    if (m.revealsContacts(to)) await tx.applicationOrg.updateMany({ where: { id: o.id, contactsOpenedOn: null }, data: { contactsOpenedOn: now } });
    await tx.statusEvent.create({ data: { applicationOrgId: o.id, fromStatus: o.status, toStatus: to, actor: 'customer', createdBy: by, requestUid: currentContext()?.uid ?? null } });
  }

  /** One organisation's record: accept the offer, decline / cancel. Allowed transitions come from the database. */
  async changeStatus(id: number, uid: string, body: unknown) {
    const { status } = parse(changeBody, body);
    const o = await this.prisma.applicationOrg.findFirst({
      where: { id: BigInt(id), uid, isDeleted: false, application: { userId: me(), isDeleted: false } },
      include: { application: { select: { id: true, userId: true, cityId: true, productTypeId: true } } },
    });
    if (!o) throw notFound('განაცხადი');
    const m = await this.statuses.machine();
    if (!m.canTransition(o.status, status, 'customer')) throw conflict(`სტატუსის ცვლილება „${o.status}" → „${status}" დაუშვებელია`);
    await this.prisma.$transaction((tx: Prisma.TransactionClient) => this.move(tx, o, status, new Date(), me()));
    this.announce(o.application, o, status);
    return { id: o.id, uid: o.uid };
  }

  /**
   * The customer's answer to the offers, sent at once: the offers marked "choose" are accepted, those marked "cancel"
   * are cancelled — all or none. Offers left unmarked, and organisations without an offer yet, are not touched.
   */
  async respond(id: number, uid: string, body: unknown) {
    const d = parse(respondBody, body);
    const row = await this.load(id, uid);
    const m = await this.statuses.machine();
    // waiting for the customer = an offer is there and the customer has a non-cancelling next step (accept)
    const acceptOf = (o: { status: string }) => m.nextStatuses(o.status, 'customer').find((k) => m.categoryOf(k) !== 'canceled');
    const cancelOf = (o: { status: string }) => m.nextStatuses(o.status, 'customer').find((k) => m.categoryOf(k) === 'canceled');
    const waiting = row.orgs.filter((o) => o.offers.length && acceptOf(o));
    // chosen offers → their organisations are accepted
    const offerIds = [...new Set(d.offerIds.map(String))];
    const offerOrg = new Map(row.orgs.flatMap((o) => o.offers.map((of) => [String(of.id), o] as const)));
    if (offerIds.some((x) => !offerOrg.has(x))) throw validation([{ field: 'OfferIDs', message: 'შეთავაზება ამ განაცხადს არ ეკუთვნის' }]);
    const accept = [...new Set([...d.acceptIds.map(String), ...offerIds.map((x) => String(offerOrg.get(x)!.id))])];
    const decline = [...new Set(d.declineIds.map(String))];
    if (!accept.length && !decline.length) throw validation([{ field: 'AcceptIDs', message: 'მონიშნე მინიმუმ ერთი შეთავაზება' }]);
    if (accept.some((x) => decline.includes(x))) throw validation([{ field: 'DeclineIDs', message: 'ერთი შეთავაზება ორივე სიაშია' }]);
    const find = (ids: string[], field: string) => {
      const rows = row.orgs.filter((o) => ids.includes(String(o.id)));
      if (rows.length !== ids.length) throw validation([{ field, message: 'ორგანიზაცია ამ განაცხადს არ ეკუთვნის' }]);
      return rows;
    };
    const toAccept = find(accept, 'AcceptIDs');
    const toDecline = find(decline, 'DeclineIDs');
    // which offers are chosen: the ones named; an organisation accepted without naming one — its only offer
    const chosen = toAccept.flatMap((o) => {
      const mine = o.offers.filter((of) => offerIds.includes(String(of.id)));
      if (mine.length) return mine.map((of) => of.id);
      if (o.offers.length > 1) throw validation([{ field: 'OfferIDs', message: `აირჩიე შეთავაზება: ${o.organization.nameKa}` }]);
      return o.offers.map((of) => of.id);
    });
    // accept — only an offer that waits for the answer; decline — also an organisation that has not sent its offer yet
    // (finishing the comparison closes the search with them too)
    const bad = [...toAccept.filter((o) => !waiting.includes(o)), ...toDecline.filter((o) => !cancelOf(o))];
    if (bad.length) throw conflict(`ამ შეთავაზებაზე პასუხი ახლა შეუძლებელია: ${bad.map((o) => o.organization.nameKa).join(', ')}`);
    const moves = [...toAccept.map((o) => ({ o, to: acceptOf(o) })), ...toDecline.map((o) => ({ o, to: cancelOf(o) }))].filter(
      (x): x is { o: (typeof row.orgs)[number]; to: string } => !!x.to,
    );
    const now = new Date();
    const by = me();
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      for (const { o, to } of moves) await this.move(tx, o, to, now, by);
      if (chosen.length) await tx.offer.updateMany({ where: { id: { in: chosen } }, data: { chosenOn: now, updatedBy: by, updatedOn: now } });
    });
    for (const { o, to } of moves) this.announce(row, o, to);
    return { id: row.id, uid: row.uid };
  }

  /** Live update for the organisation (and the customer's other open tabs). */
  private announce(a: { id: bigint; userId: bigint; cityId: bigint | null; productTypeId: bigint }, o: { id: bigint; organizationId: bigint }, status: string) {
    this.events.publish({ type: 'application.status', applicationId: a.id, applicationOrgId: o.id, organizationId: o.organizationId, userId: a.userId, cityId: a.cityId, productTypeId: a.productTypeId, status, actor: 'customer' });
  }
}

@Controller('client/application')
export class ClientApplicationController {
  constructor(private readonly svc: ClientApplicationService) {}

  @Post('sendPhoneOtp')
  sendPhoneOtp(@Body() body: unknown) {
    return this.svc.sendPhoneOtp(body);
  }

  @Post('add')
  add(@Body() body: unknown) {
    return this.svc.add(body);
  }

  @Post('find/:pageNumber/:pageSize')
  find(@Param('pageNumber', ParseIntPipe) p: number, @Param('pageSize', ParseIntPipe) s: number, @Body() body: unknown) {
    return this.svc.find(p, s, body);
  }

  @Get('detail/:id/:uid')
  detail(@Param('id', ParseIntPipe) id: number, @Param('uid') uid: string) {
    return this.svc.detail(id, uid);
  }

  @Put('cancel/:id/:uid')
  cancel(@Param('id', ParseIntPipe) id: number, @Param('uid') uid: string) {
    return this.svc.cancel(id, uid);
  }

  /** Send the answers: { OfferIDs: [chosen offers], AcceptIDs: [organisations], DeclineIDs: [organisations] }; the rest stay. */
  @Put('respond/:id/:uid')
  respond(@Param('id', ParseIntPipe) id: number, @Param('uid') uid: string, @Body() body: unknown) {
    return this.svc.respond(id, uid, body);
  }
}

/** One organisation's record of the customer's application. */
@Controller('client/applicationOrg')
export class ClientApplicationOrgController {
  constructor(private readonly svc: ClientApplicationService) {}

  @Put('changeStatus/:id/:uid')
  changeStatus(@Param('id', ParseIntPipe) id: number, @Param('uid') uid: string, @Body() body: unknown) {
    return this.svc.changeStatus(id, uid, body);
  }
}
