// Expiry worker: records past their deadline move to the expiry status (system), with a history event.
// Runs against an API started with EXPIRY_WORKER=true, EXPIRY_INTERVAL_SECONDS=1 (see run.mjs).
import { PrismaClient } from '@prisma/client';
import { done, ok } from './lib.mjs';

const prisma = new PrismaClient();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// a fresh record that is already overdue
const row = await prisma.applicationOrg.findFirst({ where: { status: 'interested', isDeleted: false } });
await prisma.applicationOrg.update({ where: { id: row.id }, data: { expiresOn: new Date(Date.now() - 1000) } });
// and one that is still in time
const future = await prisma.applicationOrg.findFirst({ where: { status: 'sent', isDeleted: false, NOT: { id: row.id } } });
await prisma.applicationOrg.update({ where: { id: future.id }, data: { expiresOn: new Date(Date.now() + 3600_000) } });

await sleep(3500);

const after = await prisma.applicationOrg.findUnique({ where: { id: row.id }, include: { events: { orderBy: { createdOn: 'asc' } } } });
const ev = after.events.at(-1);
ok(after.status === 'expired' && after.expiresOn === null, 'overdue record moved to "expired", no new deadline', after.status);
ok(ev.fromStatus === 'interested' && ev.toStatus === 'expired' && ev.actor === 'system', 'history event by the system');
const kept = await prisma.applicationOrg.findUnique({ where: { id: future.id } });
ok(kept.status === 'sent', 'record still in time is not touched');
const overdue = await prisma.applicationOrg.count({ where: { isDeleted: false, expiresOn: { lt: new Date(Date.now() - 3000) }, status: { in: ['sent', 'interested', 'offer', 'accepted'] } } });
ok(overdue === 0, 'no overdue in-progress records left', overdue);

await prisma.$disconnect();
done();
