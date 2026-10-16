import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Type } from '@nestjs/common';
import { z, ZodTypeAny } from 'zod';
import { camelKey, fromApi, pascalKey } from './case';
import { AppError, notFound, validation } from './errors';
import { PrismaService } from './prisma.service';
import { currentUserId } from './request-context';

// Standard CRUD for BaseEntity tables — STANDARDS.md §2:
//   POST add · PUT edit|enable|disable/{id}/{uid} · DELETE delete/{id}/{uid} · GET detail/{id}/{uid} · POST find/{page}/{size}
// Every single-record call needs both id and uid; a mismatch is NOT_FOUND. Deleted rows are never returned.

/** Minimal Prisma delegate surface used by the generic service. */
interface Delegate {
  create(args: { data: object; select?: object }): Promise<{ id: bigint; uid: string }>;
  update(args: { where: object; data: object; select?: object }): Promise<{ id: bigint; uid: string }>;
  findFirst(args: { where: object; include?: object }): Promise<Record<string, unknown> | null>;
  findMany(args: { where: object; orderBy?: object[]; skip?: number; take?: number; include?: object }): Promise<Record<string, unknown>[]>;
  count(args: { where: object }): Promise<number>;
}

export interface CrudConfig<S extends ZodTypeAny = ZodTypeAny> {
  /** URL: /{gateway}/{module}/… */
  gateway: string;
  module: string;
  /** Prisma model accessor name, e.g. 'city' */
  model: string;
  /** Body schema for add/edit (camelCase after conversion) */
  schema: S;
  /** Fields searched by Filter.Search (case-insensitive contains) */
  searchFields?: string[];
  /** Fields allowed in Filter as exact match and in Sort */
  filterFields?: string[];
  defaultSort?: { field: string; dir: 'asc' | 'desc' }[];
  /** Fixed condition added to every query (e.g. reference item kind) */
  scope?: Record<string, unknown>;
  include?: object;
  /** Business keys unique among non-deleted rows, e.g. [['code']] or [['cityId', 'code']] → 409 CONFLICT. */
  unique?: string[][];
  /** Enables `move` (↑↓): rows are reordered by `sort` within the same values of these fields (e.g. ['regionId']). */
  moveGroup?: string[];
  /** Extra checks on add/edit (data is camelCase, already parsed); throw AppError to reject. */
  validate?: (data: Record<string, unknown>, prisma: PrismaService, id: bigint | null) => Promise<void>;
  /** Extra checks before soft delete; throw AppError (usually CONFLICT) to reject. */
  beforeDelete?: (row: Record<string, unknown>, prisma: PrismaService) => Promise<void>;
  /** Extra checks before enable/disable. */
  beforeEnable?: (row: Record<string, unknown>, isEnable: boolean, prisma: PrismaService) => Promise<void>;
  /** Allowed actions; default — all standard actions. Others answer NOT_FOUND. */
  actions?: CrudAction[];
}

export type CrudAction = 'add' | 'edit' | 'enable' | 'disable' | 'delete' | 'detail' | 'find' | 'move';

const PAGE_MAX = 100;

const findBody = z
  .object({
    filter: z.record(z.unknown()).optional(),
    sort: z.array(z.object({ field: z.string(), dir: z.enum(['asc', 'desc']).default('asc') })).optional(),
  })
  .default({});

export const parse = <S extends ZodTypeAny>(schema: S, body: unknown): z.infer<S> => {
  const r = schema.safeParse(fromApi(body ?? {}));
  if (!r.success) {
    throw validation(r.error.issues.map((i) => ({ field: i.path.map((p) => (typeof p === 'string' ? p.charAt(0).toUpperCase() + p.slice(1) : p)).join('.') || 'Body', message: i.message })));
  }
  return r.data;
};

export class CrudService<S extends ZodTypeAny = ZodTypeAny> {
  constructor(
    protected readonly prisma: PrismaService,
    readonly cfg: CrudConfig<S>,
  ) {}

  protected get db(): Delegate {
    return (this.prisma as unknown as Record<string, Delegate>)[this.cfg.model];
  }

  /** Throws NOT_FOUND for actions this module does not offer. */
  allow(action: CrudAction) {
    if (this.cfg.actions && !this.cfg.actions.includes(action)) throw notFound('მოქმედება');
  }

  protected live(extra: object = {}) {
    return { isDeleted: false, ...(this.cfg.scope ?? {}), ...extra };
  }

  /** Loads the row by id + uid, or throws NOT_FOUND. */
  async get(id: number, uid: string) {
    const row = await this.db.findFirst({ where: this.live({ id: BigInt(id), uid }), include: this.cfg.include });
    if (!row) throw notFound();
    return row;
  }

  /** Soft-deleted rows don't count — the same code can be added again after delete. */
  private async checkUnique(data: Record<string, unknown>, selfId: bigint | null) {
    for (const keys of this.cfg.unique ?? []) {
      const where = this.live(Object.fromEntries(keys.map((k) => [k, data[k]])));
      if (selfId !== null) Object.assign(where, { NOT: { id: selfId } });
      if (await this.db.count({ where })) {
        throw new AppError('CONFLICT', 'ასეთი ჩანაწერი უკვე არსებობს', keys.map((k) => ({ field: pascalKey(k), message: 'უნიკალური უნდა იყოს' })));
      }
    }
  }

  async add(body: unknown) {
    const data = parse(this.cfg.schema, body) as Record<string, unknown>;
    await this.checkUnique(data, null);
    await this.cfg.validate?.(data, this.prisma, null);
    if (this.cfg.moveGroup && data.sort === 0) data.sort = await this.nextSort(data);
    const row = await this.db.create({ data: { ...data, ...(this.cfg.scope ?? {}), createdBy: currentUserId() }, select: { id: true, uid: true } });
    return { id: row.id, uid: row.uid };
  }

  async edit(id: number, uid: string, body: unknown) {
    await this.get(id, uid);
    const data = parse(this.cfg.schema, body) as Record<string, unknown>;
    await this.checkUnique(data, BigInt(id));
    await this.cfg.validate?.(data, this.prisma, BigInt(id));
    const row = await this.db.update({ where: { id: BigInt(id) }, data: { ...data, updatedBy: currentUserId(), updatedOn: new Date() }, select: { id: true, uid: true } });
    return { id: row.id, uid: row.uid };
  }

  async setEnable(id: number, uid: string, isEnable: boolean) {
    const existing = await this.get(id, uid);
    await this.cfg.beforeEnable?.(existing, isEnable, this.prisma);
    const row = await this.db.update({ where: { id: BigInt(id) }, data: { isEnable, updatedBy: currentUserId(), updatedOn: new Date() }, select: { id: true, uid: true } });
    return { id: row.id, uid: row.uid };
  }

  /** New rows go to the end of their group: max(sort) + 10. */
  private async nextSort(data: Record<string, unknown>) {
    const group = Object.fromEntries((this.cfg.moveGroup ?? []).map((f) => [f, data[f]]));
    const last = await this.db.findMany({ where: this.live(group), orderBy: [{ sort: 'desc' }], take: 1 });
    return ((last[0]?.sort as number | undefined) ?? 0) + 10;
  }

  /** ↑↓: swaps `sort` with the neighbour in the same group. */
  async move(id: number, uid: string, body: unknown) {
    if (!this.cfg.moveGroup) throw notFound('მოქმედება');
    const { direction } = parse(z.object({ direction: z.enum(['up', 'down']) }), body);
    const row = await this.get(id, uid);
    const group = Object.fromEntries(this.cfg.moveGroup.map((f) => [f, row[f]]));
    const list = await this.db.findMany({ where: this.live(group), orderBy: [{ sort: 'asc' }, { id: 'asc' }] });
    const i = list.findIndex((r) => r.id === row.id);
    const j = direction === 'up' ? i - 1 : i + 1;
    if (j >= 0 && j < list.length) {
      // renumber 10, 20, 30 … so equal sort values can't block the swap
      [list[i], list[j]] = [list[j], list[i]];
      await this.prisma.$transaction(
        list.map((r, k) => this.db.update({ where: { id: r.id as bigint }, data: { sort: (k + 1) * 10, updatedBy: currentUserId(), updatedOn: new Date() } })) as never,
      );
    }
    return { id: row.id as bigint, uid: row.uid as string };
  }

  async remove(id: number, uid: string) {
    const existing = await this.get(id, uid);
    await this.cfg.beforeDelete?.(existing, this.prisma);
    const row = await this.db.update({ where: { id: BigInt(id) }, data: { isDeleted: true, deletedBy: currentUserId(), deletedOn: new Date() }, select: { id: true, uid: true } });
    return { id: row.id, uid: row.uid };
  }

  async find(pageNumber: number, pageSize: number, body: unknown) {
    if (pageNumber < 1) throw validation([{ field: 'PageNumber', message: 'მინიმუმ 1' }]);
    if (pageSize < 1 || pageSize > PAGE_MAX) throw validation([{ field: 'PageSize', message: `1-დან ${PAGE_MAX}-მდე` }]);
    const { filter = {}, sort } = parse(findBody, body);
    const allowed = new Set(['isEnable', ...(this.cfg.filterFields ?? [])]);
    const where: Record<string, unknown> = this.live();
    for (const [k, v] of Object.entries(filter)) {
      if (k === 'search') continue;
      if (!allowed.has(k)) throw validation([{ field: `Filter.${k}`, message: 'ამ ველით ფილტრი არ არის დაშვებული' }]);
      where[k] = typeof v === 'number' && /Id$/.test(k) ? BigInt(v) : v;
    }
    const search = typeof filter.search === 'string' ? filter.search.trim() : '';
    if (search && this.cfg.searchFields?.length) {
      // 'user.email' → { user: { email: { contains } } }
      where.OR = this.cfg.searchFields.map((f) => f.split('.').reduceRight<object>((acc, k) => ({ [k]: acc }), { contains: search, mode: 'insensitive' }));
    }
    const sortable = new Set(['id', 'createdOn', 'sort', ...(this.cfg.filterFields ?? []), ...(this.cfg.searchFields ?? []).filter((f) => !f.includes('.'))]);
    // Sort.Field comes as an API name (PascalCase, e.g. RegionID) — same mapping as keys
    const orderBy = (sort?.length ? sort.map((x) => ({ ...x, field: camelKey(x.field) })) : this.cfg.defaultSort ?? [{ field: 'id', dir: 'asc' as const }]).map((s) => {
      if (!sortable.has(s.field)) throw validation([{ field: `Sort.${s.field}`, message: 'ამ ველით სორტირება არ არის დაშვებული' }]);
      return { [s.field]: s.dir };
    });
    const [items, totalCount] = await Promise.all([
      this.db.findMany({ where, orderBy, skip: (pageNumber - 1) * pageSize, take: pageSize, include: this.cfg.include }),
      this.db.count({ where }),
    ]);
    return { items, pageNumber, pageSize, totalCount, totalPages: Math.ceil(totalCount / pageSize) };
  }
}

/** Builds the standard controller for a CRUD service. */
export const crudController = (cfg: CrudConfig, serviceToken: Type<CrudService>) => {
  @Controller(`${cfg.gateway}/${cfg.module}`)
  class GeneratedCrudController {
    constructor(readonly svc: CrudService) {}

    @Post('add')
    add(@Body() body: unknown) {
      this.svc.allow('add');
      return this.svc.add(body);
    }

    @Put('edit/:id/:uid')
    edit(@Param('id', ParseIntPipe) id: number, @Param('uid') uid: string, @Body() body: unknown) {
      this.svc.allow('edit');
      return this.svc.edit(id, uid, body);
    }

    @Put('enable/:id/:uid')
    enable(@Param('id', ParseIntPipe) id: number, @Param('uid') uid: string) {
      this.svc.allow('enable');
      return this.svc.setEnable(id, uid, true);
    }

    @Put('disable/:id/:uid')
    disable(@Param('id', ParseIntPipe) id: number, @Param('uid') uid: string) {
      this.svc.allow('disable');
      return this.svc.setEnable(id, uid, false);
    }

    @Put('move/:id/:uid')
    move(@Param('id', ParseIntPipe) id: number, @Param('uid') uid: string, @Body() body: unknown) {
      this.svc.allow('move');
      return this.svc.move(id, uid, body);
    }

    @Delete('delete/:id/:uid')
    remove(@Param('id', ParseIntPipe) id: number, @Param('uid') uid: string) {
      this.svc.allow('delete');
      return this.svc.remove(id, uid);
    }

    @Get('detail/:id/:uid')
    detail(@Param('id', ParseIntPipe) id: number, @Param('uid') uid: string) {
      this.svc.allow('detail');
      return this.svc.get(id, uid);
    }

    @Post('find/:pageNumber/:pageSize')
    find(@Param('pageNumber', ParseIntPipe) pageNumber: number, @Param('pageSize', ParseIntPipe) pageSize: number, @Body() body: unknown) {
      this.svc.allow('find');
      return this.svc.find(pageNumber, pageSize, body);
    }
  }
  // inject the concrete service class
  Reflect.defineMetadata('design:paramtypes', [serviceToken], GeneratedCrudController);
  Object.defineProperty(GeneratedCrudController, 'name', { value: `${cfg.gateway}_${cfg.module}_Controller` });
  return GeneratedCrudController;
};

/** Builds a service class + controller pair for one table. */
export const crudModuleParts = <S extends ZodTypeAny>(cfg: CrudConfig<S>) => {
  class Service extends CrudService<S> {
    constructor(prisma: PrismaService) {
      super(prisma, cfg);
    }
  }
  Reflect.defineMetadata('design:paramtypes', [PrismaService], Service);
  Object.defineProperty(Service, 'name', { value: `${cfg.gateway}_${cfg.module}_Service` });
  return { service: Service as Type<CrudService>, controller: crudController(cfg as CrudConfig, Service as Type<CrudService>) };
};
