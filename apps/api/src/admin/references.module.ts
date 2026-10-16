import { Module } from '@nestjs/common';
import { z } from 'zod';
import { CrudConfig, crudModuleParts } from '../core/crud';
import { conflict, validation } from '../core/errors';

// Admin reference data and configuration — standard CRUD for each table (STANDARDS.md §2), plus `move` (↑↓) where rows are ordered.
// Access: admin profiles only (AuthGuard); analyst — read, operator — organisations, super — everything.

const name = { nameKa: z.string().trim().min(1), nameEn: z.string().trim().min(1) };
const code = z.string().trim().min(1).regex(/^[a-z0-9_]+$/, 'მხოლოდ a-z, 0-9 და _');
const sort = z.number().int().default(0);
const id = z.coerce.bigint();

/** Reference item kinds kept in one table — each gets its own module URL. */
const ITEM_KINDS: Record<string, string> = {
  offerType: 'offer_type',
  rejectReason: 'reject_reason',
  cancelReason: 'cancel_reason',
  sector: 'sector',
  incomeSource: 'income_source',
  creditHistory: 'credit_history',
};

const STATUS_CATEGORIES = ['progress', 'complete', 'canceled'] as const;
const ACTORS = ['customer', 'partner', 'system', 'admin'] as const;

/** One OTP channel (SMS or email) — same fields as the prototype settings dialog. */
const otpChannel = z.object({
  on: z.boolean(),
  len: z.number().int().min(4).max(6),
  ttl: z.number().int().min(30).max(3600),
  tries: z.number().int().min(1).max(10),
  resend: z.number().int().min(10).max(600),
  sender: z.string().trim().min(1),
  tpl: z.string().trim().includes('{code}', { message: 'შაბლონში უნდა იყოს {code}' }),
});
const SETTING_VALUES: Record<string, z.ZodTypeAny> = {
  otp: z
    .object({ sms: otpChannel, email: otpChannel })
    .refine((v) => v.sms.on || v.email.on, { message: 'ერთი არხი მაინც უნდა იყოს ჩართული', path: ['sms', 'on'] }),
  contacts: z.object({ phone: z.string().trim().min(1), email: z.string().trim().email() }),
  // who gets e-mail / SMS about applications (the bell and browser notifications are always on)
  notify: z.object({ staffEmail: z.boolean(), staffSms: z.boolean(), customerEmail: z.boolean(), customerSms: z.boolean() }),
};

const configs: CrudConfig[] = [
  {
    gateway: 'admin', module: 'currency', model: 'currency',
    schema: z.object({ code: z.string().trim().length(3).toUpperCase(), symbol: z.string().trim().min(1).max(4), sort }),
    searchFields: ['code'], defaultSort: [{ field: 'sort', dir: 'asc' }], moveGroup: [], unique: [['code']],
  },
  {
    gateway: 'admin', module: 'region', model: 'region',
    schema: z.object({ code, ...name, sort }),
    searchFields: ['nameKa', 'nameEn', 'code'], defaultSort: [{ field: 'sort', dir: 'asc' }], moveGroup: [], unique: [['code']],
  },
  {
    gateway: 'admin', module: 'city', model: 'city',
    schema: z.object({ regionId: id, code, ...name, sort }),
    searchFields: ['nameKa', 'nameEn', 'code'], filterFields: ['regionId'], defaultSort: [{ field: 'sort', dir: 'asc' }], moveGroup: ['regionId'], unique: [['code']],
  },
  {
    gateway: 'admin', module: 'district', model: 'district',
    schema: z.object({ cityId: id, code, ...name, sort }),
    searchFields: ['nameKa', 'nameEn', 'code'], filterFields: ['cityId'], defaultSort: [{ field: 'sort', dir: 'asc' }], moveGroup: ['cityId'], unique: [['cityId', 'code']],
  },
  ...Object.entries(ITEM_KINDS).map(([module, kind]): CrudConfig => ({
    gateway: 'admin', module, model: 'referenceItem', scope: { kind },
    schema: z.object({ code, ...name, sort }),
    searchFields: ['nameKa', 'nameEn', 'code'], defaultSort: [{ field: 'sort', dir: 'asc' }], moveGroup: [], unique: [['code']],
  })),
  {
    gateway: 'admin', module: 'productType', model: 'productType',
    schema: z.object({
      code, ...name, sort,
      minAmount: z.number().nonnegative(), maxAmount: z.number().positive(),
      minMonths: z.number().int().positive().nullable().default(null), maxMonths: z.number().int().positive().nullable().default(null),
      noTerm: z.boolean().default(false), amountRanges: z.array(z.number().int().positive()).default([]),
    }).refine((p) => p.maxAmount >= p.minAmount, { path: ['maxAmount'], message: 'მაქსიმუმი ნაკლებია მინიმუმზე' })
      .refine((p) => p.noTerm || (p.minMonths !== null && p.maxMonths !== null && p.maxMonths >= p.minMonths), { path: ['maxMonths'], message: 'ვადა: მდე უნდა იყოს დან-ზე მეტი' }),
    searchFields: ['nameKa', 'nameEn', 'code'], defaultSort: [{ field: 'sort', dir: 'asc' }], moveGroup: [], unique: [['code']],
  },
  {
    // offer form schema of a product type — what a partner fills in an offer card
    gateway: 'admin', module: 'productTypeField', model: 'productTypeField',
    schema: z.object({
      productTypeId: id,
      key: z.string().trim().regex(/^[a-zA-Z][a-zA-Z0-9]*$/, 'ლათინური ასოები და ციფრები, ასოთი იწყება'),
      labelKa: z.string().trim().min(1), labelEn: z.string().trim().min(1),
      kind: z.enum(['number', 'money', 'int', 'select', 'bool']),
      defaultValue: z.union([z.number(), z.string(), z.boolean()]).nullable().default(null),
      step: z.number().positive().nullable().default(null),
      options: z.array(z.string().trim().min(1)).nullable().default(null),
      sort,
    }).refine((f) => f.kind !== 'select' || (f.options?.length ?? 0) >= 2, { path: ['options'], message: 'select-ს სჭირდება მინიმუმ 2 ვარიანტი' }),
    searchFields: ['key', 'labelKa', 'labelEn'], filterFields: ['productTypeId', 'kind'], defaultSort: [{ field: 'sort', dir: 'asc' }], moveGroup: ['productTypeId'], unique: [['productTypeId', 'key']],
  },
  {
    gateway: 'admin', module: 'organization', model: 'organization',
    schema: z.object({
      ...name, sort,
      category: z.enum(['bank', 'mfo', 'leasing', 'lender']),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().default(null),
      isPartner: z.boolean().default(true),
    }),
    searchFields: ['nameKa', 'nameEn'], filterFields: ['category', 'isPartner'], defaultSort: [{ field: 'sort', dir: 'asc' }], moveGroup: [],
  },
  {
    // which product types an organisation accepts
    gateway: 'admin', module: 'organizationProductType', model: 'organizationProductType',
    schema: z.object({ organizationId: id, productTypeId: id }),
    filterFields: ['organizationId', 'productTypeId'], unique: [['organizationId', 'productTypeId']], include: { productType: { select: { id: true, code: true, nameKa: true, nameEn: true } } },
  },
  {
    gateway: 'admin', module: 'status', model: 'status',
    schema: z.object({
      key: code,
      customerKa: z.string().trim().min(1), customerEn: z.string().trim().min(1),
      partnerLabel: z.string().trim().min(1), chipLabel: z.string().trim().min(1),
      category: z.enum(STATUS_CATEGORIES),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().default(null),
      ttlMinutes: z.number().int().positive().nullable().default(null),
      sort,
      hidesPersonalData: z.boolean().default(false), requiresOffer: z.boolean().default(false),
      requiresIssued: z.boolean().default(false), isExpiryTarget: z.boolean().default(false), revealsContacts: z.boolean().default(false),
    }),
    searchFields: ['key', 'customerKa', 'partnerLabel'], filterFields: ['category'], defaultSort: [{ field: 'sort', dir: 'asc' }], moveGroup: [], unique: [['key']],
    validate: async (d, prisma, selfId) => {
      if (d.isExpiryTarget) {
        const other = await prisma.status.findFirst({ where: { isDeleted: false, isExpiryTarget: true, ...(selfId ? { NOT: { id: selfId } } : {}) } });
        if (other) throw validation([{ field: 'IsExpiryTarget', message: `ვადის გასვლის სტატუსი უკვე არის: ${other.key}` }]);
      }
      if (d.isExpiryTarget && d.category !== 'canceled') throw validation([{ field: 'Category', message: 'ვადის გასვლის სტატუსი canceled კატეგორიისაა' }]);
      if (selfId) {
        // the key is referenced by records — it can't be renamed
        const cur = await prisma.status.findUnique({ where: { id: selfId } });
        if (cur && cur.key !== d.key && (await prisma.applicationOrg.count({ where: { status: cur.key } }))) throw conflict('სტატუსი გამოიყენება ჩანაწერებში — გასაღებს ვერ შეცვლი');
      }
    },
    beforeDelete: async (row, prisma) => {
      const used = await prisma.applicationOrg.count({ where: { status: row.key as string } });
      if (used) throw conflict(`სტატუსი გამოიყენება ${used} ჩანაწერში — წაშლის ნაცვლად გამორთე`);
      const links = await prisma.statusTransition.count({ where: { isDeleted: false, OR: [{ fromStatusId: row.id as bigint }, { toStatusId: row.id as bigint }] } });
      if (links) throw conflict(`სტატუსს აქვს ${links} გადასვლა — ჯერ ისინი წაშალე`);
    },
  },
  {
    gateway: 'admin', module: 'statusTransition', model: 'statusTransition',
    schema: z.object({
      fromStatusId: id, toStatusId: id, actor: z.enum(ACTORS),
      reasonKind: z.enum(['reject', 'cancel']).nullable().default(null),
    }).refine((t) => t.fromStatusId !== t.toStatusId, { path: ['toStatusId'], message: 'იგივე სტატუსში გადასვლა არ შეიძლება' }),
    filterFields: ['fromStatusId', 'toStatusId', 'actor'], unique: [['fromStatusId', 'toStatusId', 'actor']],
    include: { fromStatus: { select: { id: true, key: true } }, toStatus: { select: { id: true, key: true } } },
    validate: async (d, prisma) => {
      const n = await prisma.status.count({ where: { isDeleted: false, id: { in: [d.fromStatusId as bigint, d.toStatusId as bigint] } } });
      if (n !== 2) throw validation([{ field: 'FromStatusID', message: 'სტატუსი ვერ მოიძებნა' }]);
    },
  },
  {
    // key/value settings; the value is validated by key
    gateway: 'admin', module: 'setting', model: 'setting',
    schema: z.object({ key: z.enum(Object.keys(SETTING_VALUES) as [string, ...string[]]), value: z.unknown() }).superRefine((s, ctx) => {
      const r = SETTING_VALUES[s.key].safeParse(s.value);
      if (!r.success) for (const i of r.error.issues) ctx.addIssue({ ...i, path: ['value', ...i.path] });
    }),
    searchFields: ['key'], unique: [['key']],
    // only the editable settings (internal ones, e.g. the push keys, stay hidden)
    scope: { key: { in: Object.keys(SETTING_VALUES) } },
  },
];

const parts = configs.map(crudModuleParts);

@Module({
  controllers: parts.map((p) => p.controller),
  providers: parts.map((p) => p.service),
})
export class AdminReferencesModule {}
