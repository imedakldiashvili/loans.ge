import { Injectable, Logger, Module, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../core/prisma.service';
import { StatusConfigService } from '../core/status-config';

// Status deadlines: a record whose status has a time limit (status.ttl_minutes) and whose expires_on has passed
// is moved by the system into the expiry status (status flagged is_expiry_target, e.g. "expired"), if that
// transition exists for the actor "system". Runs inside the API every EXPIRY_INTERVAL_SECONDS (default 15);
// a PostgreSQL advisory lock makes sure only one API instance does it at a time.

const LOCK_KEY = 7_311_001; // any constant shared by all instances

@Injectable()
export class ExpiryWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly log = new Logger('ExpiryWorker');
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly statuses: StatusConfigService,
  ) {}

  onApplicationBootstrap() {
    if (process.env.EXPIRY_WORKER === 'false') return;
    const sec = Number(process.env.EXPIRY_INTERVAL_SECONDS ?? 15);
    this.timer = setInterval(() => void this.tick(), sec * 1000);
    void this.tick();
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  /** One pass; returns how many records were expired. */
  async tick(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const [{ locked }] = await this.prisma.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_lock(${LOCK_KEY}) AS locked`;
      if (!locked) return 0;
      try {
        return await this.expireDue();
      } finally {
        await this.prisma.$queryRaw`SELECT pg_advisory_unlock(${LOCK_KEY})`;
      }
    } catch (e) {
      this.log.error(`expiry pass failed: ${(e as Error).message}`);
      return 0;
    } finally {
      this.running = false;
    }
  }

  private async expireDue() {
    const m = await this.statuses.machine();
    const target = m.expiryTarget();
    if (!target) return 0;
    const due = await this.prisma.applicationOrg.findMany({
      where: { isDeleted: false, expiresOn: { lte: new Date() } },
      select: { id: true, status: true },
      take: 500,
    });
    let n = 0;
    for (const r of due) {
      if (!m.canTransition(r.status, target, 'system')) continue;
      const now = new Date();
      const done = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        // only if nobody changed the status meanwhile
        const upd = await tx.applicationOrg.updateMany({
          where: { id: r.id, status: r.status, expiresOn: { lte: now } },
          data: { status: target, statusOn: now, expiresOn: m.expiresAt(target, now), updatedOn: now },
        });
        if (!upd.count) return false;
        await tx.statusEvent.create({ data: { applicationOrgId: r.id, fromStatus: r.status, toStatus: target, actor: 'system' } });
        return true;
      });
      if (done) n++;
    }
    if (n) this.log.log(`expired ${n} record(s) → ${target}`);
    return n;
  }
}

@Module({ providers: [ExpiryWorker, StatusConfigService], exports: [ExpiryWorker] })
export class WorkerModule {}
