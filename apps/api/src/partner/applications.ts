import { Body, Controller, Get, Injectable, Param, ParseIntPipe, Post, Put } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { parse } from '../core/crud';
import { conflict, notFound, validation } from '../core/errors';
import { PrismaService } from '../core/prisma.service';
import { currentContext, currentUserId } from '../core/request-context';
import { StatusConfigService } from '../core/status-config';
import { EventsService } from '../events/events';

// Partner gateway — incoming applications (prototype partner.html): one record per application × this organisation.
// Rules: only the caller's organisation; sales — only their cities / products; in statuses flagged "hides personal data"
// (e.g. sent) the applicant is masked and never matched by search. Status changes go through the status machine (DB).

const PAGE_MAX = 100;
const ctx = () => {
  const c = currentContext();
  return { org: c?.organizationId ?? BigInt(-1), cities: c?.scopeCities ?? [], products: c?.scopeProducts ?? [] };
};

export const findBody = z.preprocess(
  (v) => v ?? {},
  z.object({
    filter: z.preprocess(
      (v) => v ?? {},
      z.object({
        search: z.string().trim().optional(),
        statuses: z.array(z.string()).optional(),
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
        cityId: z.coerce.bigint().optional(),
        districtId: z.coerce.bigint().optional(),
      }),
    ),
  }),
);

export const changeBody = z.object({
  status: z.string().min(1),
  reasonIds: z.array(z.coerce.bigint()).default([]),
  reasonText: z.string().trim().max(500).nullable().default(null),
  /** offers to send — one per offer card */
  offers: z.array(z.object({ cardId: z.coerce.bigint(), amount: z.number().positive().optional(), months: z.number().int().positive().optional() })).default([]),
  issued: z.boolean().default(false),
});

const appInclude = { productType: { select: { id: true, nameKa: true, nameEn: true } } };

@Injectable()
export class PartnerApplicationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly statuses: StatusConfigService,
    private readonly events: EventsService,
  ) {}

  /** Records this staff member may see. */
  private async baseWhere(): Promise<Prisma.ApplicationOrgWhereInput> {
    const { org, cities, products } = ctx();
    const productTypes = products.length
      ? (await this.prisma.partnerProduct.findMany({ where: { id: { in: products } }, select: { productTypeId: true } })).map((p) => p.productTypeId)
      : null;
    return {
      organizationId: org, isDeleted: false,
      application: { isDeleted: false, ...(cities.length ? { cityId: { in: cities } } : {}), ...(productTypes ? { productTypeId: { in: productTypes } } : {}) },
    };
  }

  /** Applicant hidden in statuses flagged "hides personal data". */
  private mask<T extends { status: string; uid: string; application: Record<string, unknown> }>(row: T, hidden: string[]) {
    if (!hidden.includes(row.status)) return { ...row, isMasked: false };
    const a = row.application;
    return {
      ...row, isMasked: true,
      application: { ...a, pid: null, firstName: 'განმცხადებელი', lastName: `№${row.uid.slice(-4).toUpperCase()}`, phone: null, email: null, birthDate: null, userId: null },
    };
  }

  async find(pageNumber: number, pageSize: number, body: unknown) {
    if (pageNumber < 1 || pageSize < 1 || pageSize > PAGE_MAX) throw validation([{ field: 'PageSize', message: `1-დან ${PAGE_MAX}-მდე` }]);
    const { filter: f } = parse(findBody, body);
    const hidden = await this.statuses.hiddenKeys();
    const base = await this.baseWhere();
    const app = base.application as Prisma.ApplicationWhereInput;
    const scoped: Prisma.ApplicationOrgWhereInput = {
      ...base,
      application: {
        ...app,
        ...(f.from || f.to ? { createdOn: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) } } : {}),
        ...(f.cityId ? { cityId: f.cityId } : {}),
        ...(f.districtId ? { districtId: f.districtId } : {}),
        ...(f.search ? { OR: ['firstName', 'lastName', 'pid', 'phone'].map((k) => ({ [k]: { contains: f.search, mode: 'insensitive' } })) } : {}),
      },
      // a masked applicant can't be found by name / personal number
      ...(f.search ? { status: { notIn: hidden } } : {}),
    };
    const where = { ...scoped, ...(f.statuses?.length ? { status: { in: f.statuses, ...(f.search ? { notIn: hidden } : {}) } } : {}) };
    const [rows, totalCount, counts] = await Promise.all([
      this.prisma.applicationOrg.findMany({
        where, orderBy: { createdOn: 'desc' }, skip: (pageNumber - 1) * pageSize, take: pageSize,
        include: { application: { include: appInclude }, offers: { where: { isDeleted: false } } },
      }),
      this.prisma.applicationOrg.count({ where }),
      // status chip counts over the same scope, without the status filter
      this.prisma.applicationOrg.groupBy({ by: ['status'], where: scoped, _count: { _all: true } }),
    ]);
    return {
      items: rows.map((r) => this.mask(r, hidden)), pageNumber, pageSize, totalCount, totalPages: Math.ceil(totalCount / pageSize),
      statusCounts: counts.map((c) => ({ status: c.status, count: c._count._all })),
    };
  }

  private async load(id: number, uid: string) {
    const row = await this.prisma.applicationOrg.findFirst({
      where: { ...(await this.baseWhere()), id: BigInt(id), uid },
      include: { application: { include: appInclude }, offers: { where: { isDeleted: false }, orderBy: { createdOn: 'asc' } }, events: { where: { isDeleted: false }, orderBy: { createdOn: 'asc' } } },
    });
    if (!row) throw notFound('განაცხადი');
    return row;
  }

  async detail(id: number, uid: string) {
    const row = await this.load(id, uid);
    const m = await this.statuses.machine();
    const hidden = await this.statuses.hiddenKeys();
    // what this partner can do next — buttons in the cabinet
    const next = m.nextStatuses(row.status, 'partner').map((k) => {
      const s = m.status(k)!;
      return { status: k, label: s.labels.partner, reasonKind: m.reasonKindFor(row.status, k, 'partner'), requiresOffer: !!s.flags.requiresOffer, requiresIssued: !!s.flags.requiresIssued };
    });
    return { ...this.mask(row, hidden), next };
  }

  async changeStatus(id: number, uid: string, body: unknown) {
    const d = parse(changeBody, body);
    const row = await this.load(id, uid);
    const m = await this.statuses.machine();
    if (!m.canTransition(row.status, d.status, 'partner')) throw conflict(`სტატუსის ცვლილება „${row.status}" → „${d.status}" დაუშვებელია`);
    const target = m.status(d.status)!;

    const reasonKind = m.reasonKindFor(row.status, d.status, 'partner');
    if (reasonKind) {
      if (!d.reasonIds.length && !d.reasonText) throw validation([{ field: 'ReasonIDs', message: 'მიუთითე მიზეზი' }]);
      const kind = reasonKind === 'reject' ? 'reject_reason' : 'cancel_reason';
      const ok = await this.prisma.referenceItem.count({ where: { id: { in: d.reasonIds }, kind, isDeleted: false } });
      if (ok !== d.reasonIds.length) throw validation([{ field: 'ReasonIDs', message: 'მიზეზი ცნობარიდან უნდა იყოს' }]);
    }
    if (target.flags.requiresIssued && !d.issued) throw validation([{ field: 'Issued', message: 'დაადასტურე, რომ სესხი გაცემულია' }]);
    if (target.flags.requiresOffer && !d.offers.length) throw validation([{ field: 'Offers', message: 'მინიმუმ ერთი შეთავაზება' }]);
    const offers = d.offers.length ? await this.buildOffers(row, d.offers) : [];

    const now = new Date();
    const by = currentUserId();
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.applicationOrg.update({
        where: { id: row.id },
        data: {
          status: d.status, statusOn: now, expiresOn: m.expiresAt(d.status, now), updatedBy: by, updatedOn: now,
          ...(offers.length ? { offerOn: row.offerOn ?? now } : {}),
          ...(reasonKind ? { reasonIds: d.reasonIds, reasonText: d.reasonText } : {}),
          ...(target.flags.requiresIssued ? { issued: true, issuedOn: now } : {}),
        },
      });
      for (const o of offers) await tx.offer.create({ data: { ...o, applicationOrgId: row.id, createdBy: by } });
      await tx.statusEvent.create({
        data: { applicationOrgId: row.id, fromStatus: row.status, toStatus: d.status, actor: 'partner', createdBy: by, requestUid: currentContext()?.uid ?? null },
      });
    });
    // live update: the customer's cabinet and the organisation's other open cabinets
    const a = row.application;
    this.events.publish({ type: 'application.status', applicationId: a.id, applicationOrgId: row.id, organizationId: row.organizationId, userId: a.userId, cityId: a.cityId, productTypeId: a.productTypeId, status: d.status, actor: 'partner' });
    return { id: row.id, uid: row.uid };
  }

  /** Offer terms from a card: amount and term within the card's limits; fee / insurance from the card's percentages. */
  private async buildOffers(row: Awaited<ReturnType<PartnerApplicationService['load']>>, list: z.infer<typeof changeBody>['offers']) {
    const { org, products } = ctx();
    const app = row.application;
    const amountAsked = Number(app.amount);
    const out: Prisma.OfferUncheckedCreateInput[] = [];
    for (const [i, o] of list.entries()) {
      const field = (f: string) => `Offers.${i}.${f}`;
      const card = await this.prisma.partnerOfferCard.findFirst({
        where: { id: o.cardId, isDeleted: false, isEnable: true, product: { organizationId: org, isDeleted: false, isEnable: true, ...(products.length ? { id: { in: products } } : {}) } },
        include: { product: true },
      });
      if (!card) throw validation([{ field: field('CardID'), message: 'ბარათი ვერ მოიძებნა ან გამორთულია' }]);
      if (card.product.productTypeId !== app.productTypeId) throw validation([{ field: field('CardID'), message: 'ბარათი სხვა პროდუქტისაა' }]);
      if (card.currency !== app.currency) throw validation([{ field: field('CardID'), message: 'ბარათის ვალუტა განაცხადისას არ ემთხვევა' }]);
      const v = card.values as Record<string, number>;
      const minA = v.minAmt ?? 0, maxA = v.maxAmt ?? Number.MAX_SAFE_INTEGER;
      const amount = o.amount ?? Math.min(Math.max(amountAsked, minA), maxA);
      if (amount < minA || amount > maxA) throw validation([{ field: field('Amount'), message: `თანხა ${minA}–${maxA}` }]);
      const minM = v.minM ?? 1, maxM = v.maxM ?? 12;
      const base = amount <= 3000 ? 12 : amount <= 50000 ? 36 : 120;
      const months = o.months ?? Math.min(Math.max(base, minM), maxM);
      if (months < minM || months > maxM) throw validation([{ field: field('Months'), message: `ვადა ${minM}–${maxM} თვე` }]);
      out.push({
        applicationOrgId: row.id, cardId: card.id, amount, currency: card.currency, months, rate: v.rate ?? 0,
        fee: Math.round((amount * (v.feePct ?? 0)) / 100), insMonth: Math.round((amount * (v.insPct ?? 0)) / 100), values: v,
      });
    }
    return out;
  }
}

@Controller('partner/application')
export class PartnerApplicationController {
  constructor(private readonly svc: PartnerApplicationService) {}

  @Post('find/:pageNumber/:pageSize')
  find(@Param('pageNumber', ParseIntPipe) p: number, @Param('pageSize', ParseIntPipe) s: number, @Body() body: unknown) {
    return this.svc.find(p, s, body);
  }

  @Get('detail/:id/:uid')
  detail(@Param('id', ParseIntPipe) id: number, @Param('uid') uid: string) {
    return this.svc.detail(id, uid);
  }

  /** Any partner status change (review, offer, reject, cancel, done …) — allowed transitions come from the database. */
  @Put('changeStatus/:id/:uid')
  changeStatus(@Param('id', ParseIntPipe) id: number, @Param('uid') uid: string, @Body() body: unknown) {
    return this.svc.changeStatus(id, uid, body);
  }
}
