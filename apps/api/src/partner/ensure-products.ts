import type { PrismaClient } from '@prisma/client';

// A partner's products are the product types the admin gives the organisation (admin → organisation → product types).
// The partner can't add or delete them — only switch them on / off and set currencies and offer cards.
// A product made here starts switched off: the partner turns it on when its offer cards are ready.

type Db = Pick<PrismaClient, 'partnerProduct' | 'organizationProductType'>;

/** The organisation has a (live) product for this type — creates a switched-off one when it has none. */
export async function ensurePartnerProduct(db: Db, organizationId: bigint, productTypeId: bigint, createdBy: bigint | null = null) {
  const has = await db.partnerProduct.count({ where: { organizationId, productTypeId, isDeleted: false } });
  if (has) return false;
  await db.partnerProduct.create({ data: { organizationId, productTypeId, currencies: ['GEL'], isEnable: false, createdBy } });
  return true;
}

/** Every product type an organisation has gets its partner product (idempotent) — returns how many were made. */
export async function ensureAllPartnerProducts(db: Db) {
  const links = await db.organizationProductType.findMany({ where: { isDeleted: false }, select: { organizationId: true, productTypeId: true } });
  let made = 0;
  for (const l of links) if (await ensurePartnerProduct(db, l.organizationId, l.productTypeId)) made++;
  return made;
}
