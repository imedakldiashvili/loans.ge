import { Injectable, Logger, Module, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { hostname } from 'os';
import { PrismaService } from '../core/prisma.service';
import { StatusConfigService } from '../core/status-config';
import { EventsService } from '../events/events';

// Status deadlines: a record whose status has a time limit (status.ttl_minutes) and whose expires_on has passed
// is moved by the system into the expiry status (status flagged is_expiry_target, e.g. "expired"), if that
// transition exists for the actor "system". Runs inside the API every EXPIRY_INTERVAL_SECONDS (default 15);
// a PostgreSQL advisory lock makes sure only one API instance does it at a time.
// Every run is written to job_run (admin → ლოგები → ჯობების ლოგი): what it checked, what it changed, errors.

const LOCK_KEY = 7_311_001; // any constant shared by all instances
export const EXPIRY_JOB = 'expiry';
const INSTANCE = `${hostname()}:${process.pid}`;

interface Run {
  checked: number;
  changes: { applicationOrgId: bigint; from: string; to: string }[];
}

@Injectable()
export class ExpiryWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly log = new Logger('ExpiryWorker');
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly statuses: StatusConfigService,
    private readonly events: EventsService,
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
      if (!locked) return 0; // another instance is running it
      const startedOn = new Date();
      const run: Run = { checked: 0, changes: [] };
      try {
        await this.expireDue(run);
        await this.record(startedOn, 'ok', run);
      } catch (e) {
        this.log.error(`expiry pass failed: ${(e as Error).message}`);
        await this.record(startedOn, 'error', run, (e as Error).message).catch(() => undefined);
      } finally {
        await this.prisma.$queryRaw`SELECT pg_advisory_unlock(${LOCK_KEY})`;
      }
      return run.changes.length;
    } catch (e) {
      this.log.error(`expiry pass failed: ${(e as Error).message}`);
      return 0;
    } finally {
      this.running = false;
    }
  }

  private record(startedOn: Date, status: 'ok' | 'error', run: Run, error?: string) {
    const completedOn = new Date();
    return this.prisma.jobRun.create({
      data: {
        job: EXPIRY_JOB, status, startedOn, completedOn, durationMs: completedOn.getTime() - startedOn.getTime(),
        checked: run.checked, changed: run.changes.length,
        details: run.changes.length ? run.changes.map((c) => ({ ApplicationOrgID: Number(c.applicationOrgId), From: c.from, To: c.to })) : Prisma.JsonNull,
        error: error ?? null, instance: INSTANCE,
      },
    });
  }

  private async expireDue(run: Run) {
    const m = await this.statuses.machine();
    const target = m.expiryTarget();
    if (!target) return;
    const due = await this.prisma.applicationOrg.findMany({
      where: { isDeleted: false, expiresOn: { lte: new Date() } },
      select: { id: true, status: true, organizationId: true, application: { select: { id: true, userId: true, cityId: true, productTypeId: true } } },
      take: 500,
    });
    run.checked = due.length;
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
      if (!done) continue;
      run.changes.push({ applicationOrgId: r.id, from: r.status, to: target });
      const a = r.application;
      this.events.publish({ type: 'application.status', applicationId: a.id, applicationOrgId: r.id, organizationId: r.organizationId, userId: a.userId, cityId: a.cityId, productTypeId: a.productTypeId, status: target, actor: 'system' });
    }
    if (run.changes.length) this.log.log(`expired ${run.changes.length} record(s) → ${target}`);
  }
}

@Module({ providers: [ExpiryWorker, StatusConfigService], exports: [ExpiryWorker] })
export class WorkerModule {}
