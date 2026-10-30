// One-off, non-destructive: brings an existing database from the placeholder banks (ბანკი A–G) to the
// NBG register banks (seed-data/banks). Nothing is deleted and no other data is touched:
//   1. ბანკი A–G are renamed in place (ids stay, so their applications, offers, staff and products stay with them);
//   2. register banks missing from the database are added as reference-only banks (not partners, no product types —
//      listed in the wizard's "which bank do you use" step, not on /partners); an existing bank keeps its partner flag;
//   3. banks are ordered as in the register, the other categories after them;
//   4. a bank without a logo gets its NBG logo (copied into the file storage, FS_ROOT) — uploaded logos are kept.
// Safe to re-run: every step checks the current state first.
//
//   cd apps/api && npx tsx prisma/scripts/real-banks.ts --dry-run   # shows what would change, changes nothing
//   cd apps/api && npx tsx prisma/scripts/real-banks.ts             # applies
// In the API container: docker compose -f deploy/docker-compose.yml --env-file deploy/.env exec api npx tsx prisma/scripts/real-banks.ts
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const DRY = process.argv.includes('--dry-run');
const prisma = new PrismaClient();
const banksDir = path.join(__dirname, '..', 'seed-data', 'banks');
const banks: { code: string; nameKa: string; nameEn: string; logo: string; sort: number }[] = JSON.parse(fs.readFileSync(path.join(banksDir, 'banks.json'), 'utf8')).banks;
const byCode = new Map(banks.map((b) => [b.code, b]));
const FS_ROOT = path.resolve(process.env.FS_ROOT ?? path.join(__dirname, '..', '..', 'storage', 'fs'));

/** placeholder → register bank (same mapping as the seed data) */
const PLACEHOLDERS: Record<string, string> = { 'ბანკი A': 'bog', 'ბანკი B': 'tbc', 'ბანკი C': 'liberty', 'ბანკი D': 'basis', 'ბანკი E': 'procredit', 'ბანკი F': 'credo', 'ბანკი G': 'tera' };
const PALETTE = ['#1e63b5', '#7b4fb5', '#0f9d8a', '#c0392b', '#b8860b', '#2e7d32', '#00838f', '#6d4c41', '#ad1457', '#3949ab', '#558b2f'];
const NON_BANK_SORT = 1000;

class DryRun extends Error {}

async function main() {
  const now = new Date();
  const log: string[] = [];
  const logos: { id: bigint; code: string; logo: string }[] = [];

  await prisma.$transaction(async (tx) => {
    const live = { isDeleted: false };

    // 1. rename the placeholders
    for (const [placeholder, code] of Object.entries(PLACEHOLDERS)) {
      const b = byCode.get(code)!;
      const org = await tx.organization.findFirst({ where: { ...live, nameKa: placeholder } });
      if (!org) continue;
      if (await tx.organization.findFirst({ where: { ...live, nameKa: b.nameKa } })) {
        log.push(`skip  ${placeholder}: „${b.nameKa}" already exists — left as is, check by hand`);
        continue;
      }
      await tx.organization.update({ where: { id: org.id }, data: { nameKa: b.nameKa, nameEn: b.nameEn, category: 'bank', updatedOn: now } });
      log.push(`rename ${placeholder} → ${b.nameKa} (id ${org.id})`);
    }

    // 2. add the missing register banks — reference only: a bank becomes a partner when it signs up (admin → organisations)
    let k = 0;
    for (const b of banks) {
      if (await tx.organization.findFirst({ where: { ...live, nameKa: b.nameKa } })) continue;
      const row = await tx.organization.create({
        data: { nameKa: b.nameKa, nameEn: b.nameEn, category: 'bank', color: PALETTE[k++ % PALETTE.length], isPartner: false, sort: b.sort },
      });
      log.push(`add    ${b.nameKa} (id ${row.id}, reference only — not a partner)`);
    }

    // 3. order: banks as in the register, the other categories after them
    for (const b of banks) {
      const org = await tx.organization.findFirst({ where: { ...live, nameKa: b.nameKa } });
      if (org && org.sort !== b.sort) await tx.organization.update({ where: { id: org.id }, data: { sort: b.sort, updatedOn: now } });
      if (org && !org.logoPath) logos.push({ id: org.id, code: b.code, logo: b.logo });
    }
    const moved = await tx.organization.updateMany({ where: { ...live, category: { not: 'bank' }, sort: { lt: NON_BANK_SORT } }, data: { sort: { increment: NON_BANK_SORT }, updatedOn: now } });
    if (moved.count) log.push(`sort   ${moved.count} non-bank organisations moved after the banks`);

    // 4. logos for banks that have none — the file is in place before the row points at it
    //    (on a rollback a copied file is just unused)
    for (const l of logos) {
      const key = `org/${l.code}-nbg${path.extname(l.logo)}`;
      if (!DRY) {
        fs.mkdirSync(path.join(FS_ROOT, 'org'), { recursive: true });
        fs.copyFileSync(path.join(banksDir, l.logo), path.join(FS_ROOT, key));
      }
      await tx.organization.update({ where: { id: l.id }, data: { logoPath: key, updatedOn: now } });
      log.push(`logo   ${byCode.get(l.code)!.nameKa} → ${key}`);
    }

    if (DRY) throw new DryRun();
  }, { timeout: 60_000 }).catch((e) => { if (!(e instanceof DryRun)) throw e; });

  console.log(log.length ? log.join('\n') : 'nothing to change — the database already has the register banks');
  console.log(DRY ? '\n--dry-run: nothing was changed' : `\ndone (files: ${FS_ROOT})`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
