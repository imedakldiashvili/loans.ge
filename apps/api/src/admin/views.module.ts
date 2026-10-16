import { Body, Controller, Get, Injectable, Module, Param, ParseIntPipe, Post } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { parse } from '../core/crud';
import { notFound, validation } from '../core/errors';
import { PrismaService } from '../core/prisma.service';

// Admin read-only views (prototype admin.html): applications, offers (application × organisation),
// monitoring (tiles + organisation × status matrix) and the action log.

const PAGE_MAX = 100;
const pageCheck = (pageNumber: number, pageSize: number) => {
  if (pageNumber < 1) throw validation([{ field: 'PageNumber', message: 'მინიმუმ 1' }]);
  if (pageSize < 1 || pageSize > PAGE_MAX) throw validation([{ field: 'PageSize', message: `1-დან ${PAGE_MAX}-მდე` }]);
};
/** Status → count as a list — status keys are data, so they must not become JSON field names (PascalCase). */
const countList = (m: Record<string, number>) => Object.entries(m).map(([status, count]) => ({ status, count }));
const page = <T>(items: T[], pageNumber: number, pageSize: number, totalCount: number) => ({ items, pageNumber, pageSize, totalCount, totalPages: Math.ceil(totalCount / pageSize) });

const period = { from: z.coerce.date().optional(), to: z.coerce.date().optional() };
const location = { cityId: z.coerce.bigint().optional(), districtId: z.coerce.bigint().optional() };
// missing body / Filter → empty filter
const findBody = <T extends z.ZodRawShape>(filter: T) => z.preprocess((v) => v ?? {}, z.object({ filter: z.preprocess((v) => v ?? {}, z.object(filter)) }));

/** Status keys per category, read from the `status` table. */
const statusKeysByCategory = async (prisma: PrismaService) => {
  const rows = await prisma.status.findMany({ where: { isDeleted: false }, orderBy: { sort: 'asc' } });
  const by = (c: string) => rows.filter((s) => s.category === c).map((s) => s.key);
  return { all: rows, progress: by('progress'), complete: by('complete'), canceled: by('canceled') };
};

const appWhere = (f: { search?: string; from?: Date; to?: Date; cityId?: bigint; districtId?: bigint; productTypeId?: bigint }): Prisma.ApplicationWhereInput => ({
  isDeleted: false,
  ...(f.from || f.to ? { createdOn: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) } } : {}),
  ...(f.cityId ? { cityId: f.cityId } : {}),
  ...(f.districtId ? { districtId: f.districtId } : {}),
  ...(f.productTypeId ? { productTypeId: f.productTypeId } : {}),
  ...(f.search
    ? { OR: ['firstName', 'lastName', 'pid', 'phone', 'email'].map((k) => ({ [k]: { contains: f.search, mode: 'insensitive' } })) }
    : {}),
});

const orgSelect = { select: { id: true, uid: true, nameKa: true, nameEn: true, category: true, color: true, logoPath: true } };
const offerSelect = { where: { isDeleted: false }, orderBy: { createdOn: 'asc' as const } };
const eventSelect = { where: { isDeleted: false }, orderBy: { createdOn: 'asc' as const } };

@Injectable()
export class AdminViewsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── applications: one row per customer application
  async findApplications(pageNumber: number, pageSize: number, body: unknown) {
    pageCheck(pageNumber, pageSize);
    const { filter: f } = parse(findBody({ search: z.string().trim().optional(), state: z.enum(['active', 'done']).optional(), productTypeId: z.coerce.bigint().optional(), ...location, ...period }), body);
    const cats = await statusKeysByCategory(this.prisma);
    const where = appWhere(f);
    if (f.state === 'active') where.orgs = { some: { isDeleted: false, status: { in: cats.progress } } };
    if (f.state === 'done') where.orgs = { none: { isDeleted: false, status: { in: cats.progress } } };
    const [rows, totalCount] = await Promise.all([
      this.prisma.application.findMany({
        where, orderBy: { createdOn: 'desc' }, skip: (pageNumber - 1) * pageSize, take: pageSize,
        include: { productType: { select: { id: true, nameKa: true, nameEn: true } }, orgs: { where: { isDeleted: false }, include: { organization: orgSelect, offers: offerSelect } } },
      }),
      this.prisma.application.count({ where }),
    ]);
    const items = rows.map((a) => {
      const statusCounts: Record<string, number> = {};
      for (const o of a.orgs) statusCounts[o.status] = (statusCounts[o.status] ?? 0) + 1;
      return { ...a, state: a.orgs.some((o) => cats.progress.includes(o.status)) ? 'active' : 'done', statusCounts: countList(statusCounts) };
    });
    return page(items, pageNumber, pageSize, totalCount);
  }

  async applicationDetail(id: number, uid: string) {
    const a = await this.prisma.application.findFirst({
      where: { id: BigInt(id), uid, isDeleted: false },
      include: {
        productType: { select: { id: true, nameKa: true, nameEn: true } },
        orgs: { where: { isDeleted: false }, include: { organization: orgSelect, offers: offerSelect, events: eventSelect } },
      },
    });
    if (!a) throw notFound('განაცხადი');
    return a;
  }

  // ── offers: one row per application × organisation
  async findOffers(pageNumber: number, pageSize: number, body: unknown) {
    pageCheck(pageNumber, pageSize);
    const { filter: f } = parse(
      findBody({
        search: z.string().trim().optional(), status: z.string().optional(),
        /** true = organisations that passed through `status` (monitoring matrix), not only the current one */
        passed: z.boolean().optional(),
        organizationId: z.coerce.bigint().optional(), ...location, ...period,
      }),
      body,
    );
    const where: Prisma.ApplicationOrgWhereInput = {
      isDeleted: false,
      application: appWhere(f),
      ...(f.organizationId ? { organizationId: f.organizationId } : {}),
      ...(f.status ? (f.passed ? { events: { some: { toStatus: f.status, isDeleted: false } } } : { status: f.status }) : {}),
    };
    const [items, totalCount] = await Promise.all([
      this.prisma.applicationOrg.findMany({
        where, orderBy: { createdOn: 'desc' }, skip: (pageNumber - 1) * pageSize, take: pageSize,
        include: {
          organization: orgSelect, offers: offerSelect,
          application: { include: { productType: { select: { id: true, nameKa: true, nameEn: true } } } },
        },
      }),
      this.prisma.applicationOrg.count({ where }),
    ]);
    return page(items, pageNumber, pageSize, totalCount);
  }

  async offerDetail(id: number, uid: string) {
    const o = await this.prisma.applicationOrg.findFirst({
      where: { id: BigInt(id), uid, isDeleted: false },
      include: { organization: orgSelect, offers: offerSelect, events: eventSelect, application: { include: { productType: { select: { id: true, nameKa: true, nameEn: true } } } } },
    });
    if (!o) throw notFound('შეთავაზება');
    return o;
  }

  // ── monitoring: tiles (applications / offers per category) + organisation × passed statuses
  async monitor(body: unknown) {
    const { filter: f } = parse(findBody({ organizationId: z.coerce.bigint().optional(), ...location, ...period }), body);
    const cats = await statusKeysByCategory(this.prisma);
    const orgs = await this.prisma.applicationOrg.findMany({
      where: { isDeleted: false, application: appWhere(f), ...(f.organizationId ? { organizationId: f.organizationId } : {}) },
      select: { applicationId: true, organizationId: true, status: true, events: { where: { isDeleted: false }, select: { toStatus: true } } },
    });
    const catOf = (s: string) => (cats.progress.includes(s) ? 'progress' : cats.complete.includes(s) ? 'complete' : 'canceled');

    // an application is in progress while any organisation is; else complete if any is done; else canceled
    const byApp = new Map<bigint, string[]>();
    for (const o of orgs) byApp.set(o.applicationId, [...(byApp.get(o.applicationId) ?? []), o.status]);
    const appCat = (sts: string[]) => (sts.some((s) => catOf(s) === 'progress') ? 'progress' : sts.some((s) => catOf(s) === 'complete') ? 'complete' : 'canceled');
    const tiles = { total: { applications: byApp.size, offers: orgs.length }, progress: { applications: 0, offers: 0 }, complete: { applications: 0, offers: 0 }, canceled: { applications: 0, offers: 0 } };
    for (const sts of byApp.values()) tiles[appCat(sts) as 'progress' | 'complete' | 'canceled'].applications++;
    for (const o of orgs) tiles[catOf(o.status) as 'progress' | 'complete' | 'canceled'].offers++;
    // breakdown of each tile by status: applications by their leading status, offers by current status.
    // Leading status (prototype appStatus/PRI): the most advanced in-progress one; otherwise complete; otherwise the first canceled one.
    const sortOf = new Map(cats.all.map((x) => [x.key, x.sort]));
    const lead = (sts: string[]) => {
      const c = appCat(sts);
      const mine = sts.filter((x) => catOf(x) === c).sort((a, b) => (sortOf.get(a) ?? 0) - (sortOf.get(b) ?? 0));
      return c === 'progress' ? mine[mine.length - 1] : mine[0];
    };
    const byStatus = new Map<string, { applications: number; offers: number }>();
    const slot = (k: string) => byStatus.get(k) ?? (byStatus.set(k, { applications: 0, offers: 0 }), byStatus.get(k)!);
    for (const sts of byApp.values()) slot(lead(sts)).applications++;
    for (const o of orgs) slot(o.status).offers++;
    const breakdown = cats.all.filter((x) => byStatus.has(x.key)).map((x) => ({ status: x.key, ...byStatus.get(x.key)! }));

    // matrix: statuses each record has passed through (so "sent" is the largest)
    const rows = new Map<bigint, Record<string, number>>();
    const totals: Record<string, number> = {};
    for (const o of orgs) {
      const passed = new Set([...o.events.map((e) => e.toStatus), o.status]);
      const r = rows.get(o.organizationId) ?? {};
      for (const s of passed) {
        r[s] = (r[s] ?? 0) + 1;
        totals[s] = (totals[s] ?? 0) + 1;
      }
      rows.set(o.organizationId, r);
    }
    const orgInfo = await this.prisma.organization.findMany({ where: { id: { in: [...rows.keys()] } }, ...orgSelect, orderBy: { sort: 'asc' } });
    return {
      tiles, breakdown,
      statuses: cats.all.map((s) => ({ key: s.key, chipLabel: s.chipLabel, category: s.category, color: s.color })),
      matrix: orgInfo.map((o) => ({ organization: o, counts: countList(rows.get(o.id) ?? {}) })),
      totals: countList(totals),
    };
  }

  // ── action log
  async findActionLog(pageNumber: number, pageSize: number, body: unknown) {
    pageCheck(pageNumber, pageSize);
    const { filter: f } = parse(
      findBody({
        search: z.string().trim().optional(), uid: z.string().uuid().optional(), createdBy: z.coerce.bigint().optional(),
        gateway: z.string().optional(), module: z.string().optional(), action: z.string().optional(),
        itemId: z.coerce.bigint().optional(), isSuccess: z.boolean().optional(), ...period,
      }),
      body,
    );
    const where: Prisma.ActionLogWhereInput = {
      ...(f.uid ? { uid: f.uid } : {}), ...(f.createdBy ? { createdBy: f.createdBy } : {}),
      ...(f.gateway ? { gateway: f.gateway } : {}), ...(f.module ? { module: f.module } : {}), ...(f.action ? { action: f.action } : {}),
      ...(f.itemId ? { itemId: f.itemId } : {}), ...(f.isSuccess !== undefined ? { isSuccess: f.isSuccess } : {}),
      ...(f.from || f.to ? { createdOn: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) } } : {}),
      ...(f.search ? { url: { contains: f.search, mode: 'insensitive' } } : {}),
    };
    const [items, totalCount] = await Promise.all([
      this.prisma.actionLog.findMany({ where, orderBy: { createdOn: 'desc' }, skip: (pageNumber - 1) * pageSize, take: pageSize }),
      this.prisma.actionLog.count({ where }),
    ]);
    return page(items, pageNumber, pageSize, totalCount);
  }

  /** One call with its request and response (linked by uid). */
  async actionLogDetail(id: number, uid: string) {
    const log = await this.prisma.actionLog.findFirst({ where: { id: BigInt(id), uid } });
    if (!log) throw notFound('ჩანაწერი');
    const [request, response] = await Promise.all([
      this.prisma.actionLogRequest.findUnique({ where: { uid } }),
      this.prisma.actionLogResponse.findUnique({ where: { uid } }),
    ]);
    return { ...log, request, response };
  }
}

@Controller('admin/application')
class ApplicationController {
  constructor(private readonly svc: AdminViewsService) {}
  @Post('find/:pageNumber/:pageSize')
  find(@Param('pageNumber', ParseIntPipe) p: number, @Param('pageSize', ParseIntPipe) s: number, @Body() body: unknown) {
    return this.svc.findApplications(p, s, body);
  }
  @Get('detail/:id/:uid')
  detail(@Param('id', ParseIntPipe) id: number, @Param('uid') uid: string) {
    return this.svc.applicationDetail(id, uid);
  }
}

@Controller('admin/offer')
class OfferController {
  constructor(private readonly svc: AdminViewsService) {}
  @Post('find/:pageNumber/:pageSize')
  find(@Param('pageNumber', ParseIntPipe) p: number, @Param('pageSize', ParseIntPipe) s: number, @Body() body: unknown) {
    return this.svc.findOffers(p, s, body);
  }
  @Get('detail/:id/:uid')
  detail(@Param('id', ParseIntPipe) id: number, @Param('uid') uid: string) {
    return this.svc.offerDetail(id, uid);
  }
}

@Controller('admin/monitor')
class MonitorController {
  constructor(private readonly svc: AdminViewsService) {}
  @Post('summary')
  summary(@Body() body: unknown) {
    return this.svc.monitor(body);
  }
}

@Controller('admin/actionLog')
class ActionLogController {
  constructor(private readonly svc: AdminViewsService) {}
  @Post('find/:pageNumber/:pageSize')
  find(@Param('pageNumber', ParseIntPipe) p: number, @Param('pageSize', ParseIntPipe) s: number, @Body() body: unknown) {
    return this.svc.findActionLog(p, s, body);
  }
  @Get('detail/:id/:uid')
  detail(@Param('id', ParseIntPipe) id: number, @Param('uid') uid: string) {
    return this.svc.actionLogDetail(id, uid);
  }
}

@Module({
  controllers: [ApplicationController, OfferController, MonitorController, ActionLogController],
  providers: [AdminViewsService],
})
export class AdminViewsModule {}
