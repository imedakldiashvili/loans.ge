// One-off, non-destructive: every product type an organisation has gets its partner product (switched off), now that
// products come from the admin only (admin → organisation → product types; the partner just switches them on / off).
// Adds missing rows only; nothing is changed or deleted. Safe to re-run.
//
//   cd apps/api && npx tsx prisma/scripts/partner-products.ts
// In the API container: docker compose -f deploy/docker-compose.yml --env-file deploy/.env exec api npx tsx prisma/scripts/partner-products.ts
import { PrismaClient } from '@prisma/client';
import { ensureAllPartnerProducts } from '../../src/partner/ensure-products';

const prisma = new PrismaClient();

ensureAllPartnerProducts(prisma)
  .then((n) => console.log(n ? `${n} partner product(s) added (switched off)` : 'nothing to add — every organisation product type has its partner product'))
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
