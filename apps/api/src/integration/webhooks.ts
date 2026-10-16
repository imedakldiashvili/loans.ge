import { Body, Controller, Delete, Get, Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown, OnModuleInit, Param, ParseIntPipe, Post, Put } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHmac, randomBytes } from 'crypto';
import { hostname } from 'os';
import { z } from 'zod';
import { parse } from '../core/crud';
import { notFound, validation } from '../core/errors';
import { PrismaService } from '../core/prisma.service';
import { currentContext, currentUserId } from '../core/request-context';
import { ApplicationEvent, EventsService } from '../events/events';

// Webhooks (stage 6b, integration): an organisation gives a URL; every application event of that organisation
// is POSTed there as JSON, signed with HMAC-SHA256 of "<timestamp>.<body>" with the endpoint's secret:
//   X-Loans-Event: application.created | application.status | ping
//   X-Loans-Delivery: <delivery uid>   X-Loans-Timestamp: <unix seconds>   X-Loans-Signature: sha256=<hex>
// A 2xx answer within 10 s is success; otherwise it is retried after 1 min, 5 min, 30 min, 2 h, 6 h, then given up.
// Deliveries are kept (admin → ლოგები → webhook-ების ლოგი; the organisation sees its own).

export const WEBHOOK_EVENTS = ['application.created', 'application.status'] as const;
const RETRY_MINUTES = [1, 5, 30, 120, 360];
const TIMEOUT_MS = 10_000;
/** a claimed delivery is someone else's for this long (then retried if that instance died mid-send) */
const CLAIM_MS = 2 * 60_000;
const INSTANCE = `${hostname()}:${process.pid}`;

const org = () => currentContext()?.organizationId ?? BigInt(-1);
const isProd = () => process.env.NODE_ENV === 'production';
const urlSchema = z
  .string()
  .trim()
  .url('არასწორი მისამართი')
  .refine((u) => u.startsWith('https://') || (!isProd() && u.startsWith('http://')), 'მისამართი https:// უნდა იყოს');
const bodySchema = z.object({ url: urlSchema, events: z.array(z.enum(WEBHOOK_EVENTS)).min(1, 'მინიმუმ ერთი მოვლენა') });
const secret = () => `whsec_${randomBytes(24).toString('base64url')}`;

/** Signature a receiver checks: HMAC-SHA256(secret, `${timestamp}.${rawBody}`). */
export const sign = (secretValue: string, timestamp: number, body: string) => `sha256=${createHmac('sha256', secretValue).update(`${timestamp}.${body}`).digest('hex')}`;

@Injectable()
export class WebhookService implements OnModuleInit {
  private readonly log = new Logger('Webhooks');

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
  ) {}

  /** Every application event of an organisation → one pending delivery per subscribed endpoint. */
  onModuleInit() {
    this.events.applications.subscribe((e) => void this.enqueue(e).catch((err) => this.log.error(`enqueue failed: ${err?.message ?? err}`)));
  }

  private async enqueue(e: ApplicationEvent) {
    const endpoints = await this.prisma.webhookEndpoint.findMany({ where: { organizationId: e.organizationId, isDeleted: false, isEnable: true, events: { has: e.type } } });
    if (!endpoints.length) return;
    const ao = await this.prisma.applicationOrg.findUnique({ where: { id: e.applicationOrgId }, select: { uid: true } });
    const payload = {
      Event: e.type, OccurredOn: new Date().toISOString(),
      // what changed; details: GET /partner/application/detail/{ApplicationOrgID}/{ApplicationOrgUID} with the API key
      Data: { ApplicationOrgID: Number(e.applicationOrgId), ApplicationOrgUID: ao?.uid ?? null, ApplicationID: Number(e.applicationId), Status: e.status, Actor: e.actor },
    };
    await this.prisma.webhookDelivery.createMany({
      data: endpoints.map((w) => ({ endpointId: w.id, organizationId: w.organizationId, event: e.type, payload, status: 'pending', nextAttemptOn: new Date() })),
    });
  }

  // ── management (back office of the organisation)

  find() {
    return this.prisma.webhookEndpoint.findMany({
      where: { organizationId: org(), isDeleted: false },
      orderBy: { id: 'desc' },
      select: { id: true, uid: true, isEnable: true, url: true, events: true, createdOn: true, updatedOn: true },
    });
  }

  /** New endpoint — returns the signing secret (shown once; can be rotated). */
  async add(body: unknown) {
    const d = parse(bodySchema, body);
    const s = secret();
    const row = await this.prisma.webhookEndpoint.create({ data: { organizationId: org(), url: d.url, events: d.events, secret: s, createdBy: currentUserId() } });
    return { id: row.id, uid: row.uid, secret: s };
  }

  private async own(id: number, uid: string) {
    const row = await this.prisma.webhookEndpoint.findFirst({ where: { id: BigInt(id), uid, organizationId: org(), isDeleted: false } });
    if (!row) throw notFound('webhook');
    return row;
  }

  async edit(id: number, uid: string, body: unknown) {
    const d = parse(bodySchema, body);
    const row = await this.own(id, uid);
    await this.prisma.webhookEndpoint.update({ where: { id: row.id }, data: { url: d.url, events: d.events, updatedBy: currentUserId(), updatedOn: new Date() } });
    return { id: row.id, uid: row.uid };
  }

  async enable(id: number, uid: string, on: boolean) {
    const row = await this.own(id, uid);
    await this.prisma.webhookEndpoint.update({ where: { id: row.id }, data: { isEnable: on, updatedBy: currentUserId(), updatedOn: new Date() } });
    return { id: row.id, uid: row.uid };
  }

  async remove(id: number, uid: string) {
    const row = await this.own(id, uid);
    await this.prisma.webhookEndpoint.update({ where: { id: row.id }, data: { isDeleted: true, deletedBy: currentUserId(), deletedOn: new Date() } });
    return { id: row.id, uid: row.uid };
  }

  async rotateSecret(id: number, uid: string) {
    const row = await this.own(id, uid);
    const s = secret();
    await this.prisma.webhookEndpoint.update({ where: { id: row.id }, data: { secret: s, updatedBy: currentUserId(), updatedOn: new Date() } });
    return { id: row.id, uid: row.uid, secret: s };
  }

  /** A "ping" delivery to check the receiver. */
  async test(id: number, uid: string) {
    const row = await this.own(id, uid);
    const d = await this.prisma.webhookDelivery.create({
      data: { endpointId: row.id, organizationId: row.organizationId, event: 'ping', payload: { Event: 'ping', OccurredOn: new Date().toISOString(), Data: {} }, status: 'pending', nextAttemptOn: new Date() },
    });
    return { id: d.id, uid: d.uid };
  }

  // ── delivery log

  async deliveries(pageNumber: number, pageSize: number, body: unknown, organizationId?: bigint) {
    if (pageNumber < 1 || pageSize < 1 || pageSize > 100) throw validation([{ field: 'PageSize', message: '1-დან 100-მდე' }]);
    const { filter: f } = parse(
      z.preprocess((v) => v ?? {}, z.object({ filter: z.preprocess((v) => v ?? {}, z.object({ status: z.enum(['pending', 'ok', 'failed']).optional(), event: z.string().optional(), endpointId: z.coerce.bigint().optional() })) })),
      body,
    );
    const where: Prisma.WebhookDeliveryWhereInput = {
      ...(organizationId ? { organizationId } : {}), ...(f.status ? { status: f.status } : {}), ...(f.event ? { event: f.event } : {}), ...(f.endpointId ? { endpointId: f.endpointId } : {}),
    };
    const [items, totalCount] = await Promise.all([
      this.prisma.webhookDelivery.findMany({
        where, orderBy: { createdOn: 'desc' }, skip: (pageNumber - 1) * pageSize, take: pageSize,
        include: { endpoint: { select: { id: true, url: true, organization: { select: { id: true, nameKa: true } } } } },
      }),
      this.prisma.webhookDelivery.count({ where }),
    ]);
    return { items, pageNumber, pageSize, totalCount, totalPages: Math.ceil(totalCount / pageSize) };
  }

  /** One delivery with its endpoint (admin). */
  async deliveryDetail(id: number, uid: string) {
    const d = await this.prisma.webhookDelivery.findFirst({
      where: { id: BigInt(id), uid },
      include: { endpoint: { select: { id: true, url: true, organization: { select: { id: true, nameKa: true } } } } },
    });
    if (!d) throw notFound('მიწოდება');
    return d;
  }

  /** Send a delivery again (e.g. after the receiver was fixed). */
  async redeliver(id: number, uid: string) {
    const d = await this.prisma.webhookDelivery.findFirst({ where: { id: BigInt(id), uid, organizationId: org() } });
    if (!d) throw notFound('მიწოდება');
    await this.prisma.webhookDelivery.update({ where: { id: d.id }, data: { status: 'pending', nextAttemptOn: new Date() } });
    return { id: d.id, uid: d.uid };
  }
}

/** Sends pending deliveries every few seconds (each one claimed first, so several instances never double-send); runs that sent something go to job_run. */
@Injectable()
export class WebhookWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly log = new Logger('WebhookWorker');
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly prisma: PrismaService) {}

  onApplicationBootstrap() {
    if (process.env.WEBHOOK_WORKER === 'false') return;
    const sec = Number(process.env.WEBHOOK_INTERVAL_SECONDS ?? 5);
    this.timer = setInterval(() => void this.tick(), sec * 1000);
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    const startedOn = new Date();
    const done: { id: bigint; ok: boolean }[] = [];
    try {
      const due = await this.prisma.webhookDelivery.findMany({ where: { status: 'pending', nextAttemptOn: { lte: new Date() } }, include: { endpoint: true }, orderBy: { id: 'asc' }, take: 50 });
      for (const d of due) {
        // claim it: whoever moves its time forward first sends it (several API instances never send it twice)
        const claimed = await this.prisma.webhookDelivery.updateMany({ where: { id: d.id, status: 'pending', nextAttemptOn: d.nextAttemptOn }, data: { nextAttemptOn: new Date(Date.now() + CLAIM_MS) } });
        if (claimed.count) done.push({ id: d.id, ok: await this.send(d) });
      }
      if (done.length) await this.record(startedOn, 'ok', due.length, done);
    } catch (e) {
      this.log.error(`webhook pass failed: ${(e as Error).message}`);
      await this.record(startedOn, 'error', done.length, done, (e as Error).message).catch(() => undefined);
    } finally {
      this.running = false;
    }
    return done.length;
  }

  private record(startedOn: Date, status: 'ok' | 'error', checked: number, done: { id: bigint; ok: boolean }[], error?: string) {
    const completedOn = new Date();
    return this.prisma.jobRun.create({
      data: {
        job: 'webhooks', status, startedOn, completedOn, durationMs: completedOn.getTime() - startedOn.getTime(), checked, changed: done.length,
        details: done.map((x) => ({ WebhookDeliveryID: Number(x.id), Result: x.ok ? 'ok' : 'retry' })), error: error ?? null, instance: INSTANCE,
      },
    });
  }

  /** One attempt; returns true on success. */
  private async send(d: Prisma.WebhookDeliveryGetPayload<{ include: { endpoint: true } }>) {
    const started = Date.now();
    const body = JSON.stringify({ ...(d.payload as object), DeliveryUID: d.uid });
    const ts = Math.floor(started / 1000);
    let code: number | null = null;
    let text: string | null = null;
    let error: string | null = null;
    try {
      const res = await fetch(d.endpoint.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'loans.ge-webhooks/1', 'X-Loans-Event': d.event, 'X-Loans-Delivery': d.uid, 'X-Loans-Timestamp': String(ts), 'X-Loans-Signature': sign(d.endpoint.secret, ts, body) },
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
        redirect: 'manual',
      });
      code = res.status;
      text = (await res.text().catch(() => '')).slice(0, 1000);
    } catch (e) {
      error = (e as Error).name === 'TimeoutError' ? `${TIMEOUT_MS / 1000} წამში პასუხი არ მოვიდა` : (e as Error).message;
    }
    const ok = code !== null && code >= 200 && code < 300;
    const attempts = d.attempts + 1;
    const wait = RETRY_MINUTES[attempts - 1];
    await this.prisma.webhookDelivery.update({
      where: { id: d.id },
      data: {
        attempts, lastAttemptOn: new Date(), responseCode: code, responseBody: text, error, durationMs: Date.now() - started,
        status: ok ? 'ok' : wait === undefined ? 'failed' : 'pending',
        nextAttemptOn: ok || wait === undefined ? null : new Date(Date.now() + wait * 60_000),
        ...(ok ? { deliveredOn: new Date() } : {}),
      },
    });
    return ok;
  }
}

@Controller('partner/webhook')
export class PartnerWebhookController {
  constructor(private readonly svc: WebhookService) {}

  @Post('find/:pageNumber/:pageSize')
  async find() {
    const items = await this.svc.find();
    return { items, pageNumber: 1, pageSize: items.length, totalCount: items.length, totalPages: 1 };
  }

  /** Returns { ID, UID, Secret } — the signing secret is shown only now. */
  @Post('add')
  add(@Body() body: unknown) {
    return this.svc.add(body);
  }

  @Put('edit/:id/:uid')
  edit(@Param('id', ParseIntPipe) id: number, @Param('uid') uid: string, @Body() body: unknown) {
    return this.svc.edit(id, uid, body);
  }

  @Put('enable/:id/:uid')
  enable(@Param('id', ParseIntPipe) id: number, @Param('uid') uid: string) {
    return this.svc.enable(id, uid, true);
  }

  @Put('disable/:id/:uid')
  disable(@Param('id', ParseIntPipe) id: number, @Param('uid') uid: string) {
    return this.svc.enable(id, uid, false);
  }

  @Delete('delete/:id/:uid')
  remove(@Param('id', ParseIntPipe) id: number, @Param('uid') uid: string) {
    return this.svc.remove(id, uid);
  }

  /** New signing secret (the old one stops working). */
  @Put('rotateSecret/:id/:uid')
  rotate(@Param('id', ParseIntPipe) id: number, @Param('uid') uid: string) {
    return this.svc.rotateSecret(id, uid);
  }

  @Post('test/:id/:uid')
  test(@Param('id', ParseIntPipe) id: number, @Param('uid') uid: string) {
    return this.svc.test(id, uid);
  }
}

@Controller('partner/webhookDelivery')
export class PartnerWebhookDeliveryController {
  constructor(private readonly svc: WebhookService) {}

  @Post('find/:pageNumber/:pageSize')
  find(@Param('pageNumber', ParseIntPipe) p: number, @Param('pageSize', ParseIntPipe) s: number, @Body() body: unknown) {
    return this.svc.deliveries(p, s, body, org());
  }

  @Put('redeliver/:id/:uid')
  redeliver(@Param('id', ParseIntPipe) id: number, @Param('uid') uid: string) {
    return this.svc.redeliver(id, uid);
  }
}

@Controller('admin/webhookDelivery')
export class AdminWebhookDeliveryController {
  constructor(private readonly svc: WebhookService) {}

  @Post('find/:pageNumber/:pageSize')
  find(@Param('pageNumber', ParseIntPipe) p: number, @Param('pageSize', ParseIntPipe) s: number, @Body() body: unknown) {
    return this.svc.deliveries(p, s, body);
  }

  @Get('detail/:id/:uid')
  detail(@Param('id', ParseIntPipe) id: number, @Param('uid') uid: string) {
    return this.svc.deliveryDetail(id, uid);
  }
}
