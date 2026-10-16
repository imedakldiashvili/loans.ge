import { z } from 'zod';
import { contacts, profileModule, staffData, userInclude } from '../admin/users.module';
import { CrudConfig, crudModuleParts } from '../core/crud';
import { validation } from '../core/errors';
import { PrismaService } from '../core/prisma.service';
import { currentContext } from '../core/request-context';

// Partner gateway — the organisation's own catalogue and staff (prototype partner.html: Products, Users).
// Everything is limited to the caller's organisation; back office changes, sales may read products / cards.

const id = z.coerce.bigint();
const org = () => currentContext()?.organizationId ?? BigInt(-1);
/** sales see only the products they are allowed to offer (empty scope = all) */
const productScope = () => {
  const p = currentContext()?.scopeProducts ?? [];
  return p.length ? { id: { in: p } } : {};
};

const products: CrudConfig = {
  gateway: 'partner', module: 'product', model: 'partnerProduct',
  scopeFn: () => ({ organizationId: org(), ...productScope() }),
  createFn: () => ({ organizationId: org() }),
  schema: z.object({
    productTypeId: id,
    description: z.string().trim().max(500).nullable().default(null),
    currencies: z.array(z.string().trim().toUpperCase().length(3)).min(1, 'მინიმუმ ერთი ვალუტა'),
  }),
  searchFields: ['description'], filterFields: ['productTypeId'],
  include: {
    productType: { select: { id: true, uid: true, code: true, nameKa: true, nameEn: true, noTerm: true } },
    cards: { where: { isDeleted: false }, orderBy: { id: 'asc' } },
  },
  validate: async (d, prisma) => {
    const accepted = await prisma.organizationProductType.count({ where: { organizationId: org(), productTypeId: d.productTypeId as bigint, isDeleted: false } });
    if (!accepted) throw validation([{ field: 'ProductTypeID', message: 'ორგანიზაცია ამ პროდუქტის ტიპს არ იღებს' }]);
    const codes = d.currencies as string[];
    const known = await prisma.currency.count({ where: { code: { in: codes }, isDeleted: false, isEnable: true } });
    if (known !== new Set(codes).size) throw validation([{ field: 'Currencies', message: 'უცნობი ვალუტა' }]);
  },
};

/** Card values must follow the product type's field schema (admin: /admin/productTypeField). */
export const validateCardValues = async (prisma: PrismaService, productTypeId: bigint, values: Record<string, unknown>, noTerm: boolean) => {
  const fields = await prisma.productTypeField.findMany({ where: { productTypeId, isDeleted: false, isEnable: true } });
  const details: { field: string; message: string }[] = [];
  for (const [k, v] of Object.entries(values)) {
    const f = fields.find((x) => x.key === k);
    if (!f) {
      details.push({ field: `Values.${k}`, message: 'ასეთი ველი პროდუქტის სქემაში არ არის' });
      continue;
    }
    if (v === null || v === '') continue;
    if (f.kind === 'bool' && typeof v !== 'boolean') details.push({ field: `Values.${k}`, message: 'კი / არა' });
    if (['number', 'money', 'int'].includes(f.kind) && (typeof v !== 'number' || Number.isNaN(v) || v < 0)) details.push({ field: `Values.${k}`, message: 'დადებითი რიცხვი' });
    if (f.kind === 'int' && typeof v === 'number' && !Number.isInteger(v)) details.push({ field: `Values.${k}`, message: 'მთელი რიცხვი' });
    if (f.kind === 'select' && !((f.options as string[] | null) ?? []).includes(String(v))) details.push({ field: `Values.${k}`, message: 'არასწორი ვარიანტი' });
  }
  // what an offer is calculated from
  const required = ['rate', 'minAmt', 'maxAmt', ...(noTerm ? [] : ['minM', 'maxM'])].filter((k) => fields.some((f) => f.key === k));
  for (const k of required) if (typeof values[k] !== 'number') details.push({ field: `Values.${k}`, message: 'სავალდებულოა' });
  const n = (k: string) => (typeof values[k] === 'number' ? (values[k] as number) : null);
  if (n('minAmt') !== null && n('maxAmt') !== null && n('maxAmt')! < n('minAmt')!) details.push({ field: 'Values.maxAmt', message: 'მდე < დან' });
  if (n('minM') !== null && n('maxM') !== null && n('maxM')! < n('minM')!) details.push({ field: 'Values.maxM', message: 'მდე < დან' });
  if (details.length) throw validation(details);
};

const cards: CrudConfig = {
  gateway: 'partner', module: 'card', model: 'partnerOfferCard',
  scopeFn: () => ({ product: { organizationId: org(), isDeleted: false, ...productScope() } }),
  schema: z.object({
    productId: id, offerTypeId: id, currency: z.string().trim().toUpperCase().length(3),
    values: z.record(z.union([z.number(), z.string(), z.boolean(), z.null()])),
  }),
  filterFields: ['productId', 'currency', 'offerTypeId'],
  include: { product: { select: { id: true, uid: true, productTypeId: true, currencies: true } } },
  validate: async (d, prisma) => {
    const p = await prisma.partnerProduct.findFirst({ where: { id: d.productId as bigint, organizationId: org(), isDeleted: false }, include: { productType: true } });
    if (!p) throw validation([{ field: 'ProductID', message: 'პროდუქტი ვერ მოიძებნა' }]);
    if (!p.currencies.includes(d.currency as string)) throw validation([{ field: 'Currency', message: 'ვალუტა პროდუქტზე ჩართული არ არის' }]);
    const ot = await prisma.referenceItem.count({ where: { id: d.offerTypeId as bigint, kind: 'offer_type', isDeleted: false } });
    if (!ot) throw validation([{ field: 'OfferTypeID', message: 'შეთავაზების ტიპი ვერ მოიძებნა' }]);
    await validateCardValues(prisma, p.productTypeId, d.values as Record<string, unknown>, p.productType.noTerm);
  },
};

// own staff: same rules as /admin/staff, the organisation is always the caller's
const staff = profileModule(
  'staff', 'staff',
  {
    schema: z.object({
      ...contacts, displayName: z.string().trim().min(1), role: z.enum(['sales', 'back']),
      scopeProducts: z.array(z.coerce.bigint()).default([]), scopeCities: z.array(z.coerce.bigint()).default([]),
    }),
    scopeFn: () => ({ organizationId: org() }),
    searchFields: ['displayName', 'user.email', 'user.phone'], filterFields: ['role'], include: userInclude,
  },
  (d, prisma) => staffData({ ...d, organizationId: org() }, prisma),
  'partner',
);

export const PARTNER_CATALOG = [crudModuleParts(products), crudModuleParts(cards), staff];
