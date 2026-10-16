import { Controller, Get, Global, Injectable, Module, OnApplicationShutdown, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Subject } from 'rxjs';
import { AuthedRequest } from '../auth/auth.types';
import { pascalKey } from '../core/case';
import { PrismaService } from '../core/prisma.service';
import { currentContext } from '../core/request-context';

// Live updates (stage 6): instead of polling, the apps keep one Server-Sent Events stream open
// (GET /{gateway}/events/stream) and reload only what an event says changed.
// Events carry ids and the new status only — the data itself is read through the normal API with its scope / masking.
// Each gateway gets only its own events: customer — their applications, partner — their organisation, admin — all.
// The bus is in-process (the worker runs inside the API); with several API instances it moves to Redis pub/sub.

export interface AppEvent {
  /** application.created | application.status */
  type: 'application.created' | 'application.status';
  applicationId: bigint;
  applicationOrgId: bigint;
  organizationId: bigint;
  /** customer's user id */
  userId: bigint;
  /** for the sales scope (cities / products) */
  cityId: bigint | null;
  productTypeId: bigint;
  status: string;
  /** customer | partner | system | admin */
  actor: string;
  /** request that caused it (actionLog uid), if any */
  requestUid?: string | null;
}

@Global()
@Injectable()
export class EventsService implements OnApplicationShutdown {
  private readonly bus = new Subject<AppEvent>();
  readonly stream = this.bus.asObservable();

  publish(e: Omit<AppEvent, 'requestUid'>) {
    this.bus.next({ ...e, requestUid: currentContext()?.uid ?? null });
  }

  onApplicationShutdown() {
    this.bus.complete();
  }
}

const HEARTBEAT_MS = 25_000;
/** What goes to the browser: ids and the new status only (customer / city / product are for filtering, never sent). Same shape as the API. */
const wire = ({ userId: _u, cityId: _c, productTypeId: _p, ...e }: AppEvent) =>
  JSON.stringify(Object.fromEntries(Object.entries(e).map(([k, v]) => [pascalKey(k), typeof v === 'bigint' ? Number(v) : v])));

type Filter = (e: AppEvent) => boolean;
/** One controller per gateway; the auth guard has already checked the session and filled req.auth. */
const streamController = (gateway: 'client' | 'partner' | 'admin', filterFor: (req: AuthedRequest, prisma: PrismaService) => Promise<Filter>) => {
  @Controller(`${gateway}/events`)
  class EventsController {
    constructor(
      readonly events: EventsService,
      readonly prisma: PrismaService,
    ) {}

    @Get('stream')
    async stream(@Req() req: Request, @Res() res: Response) {
      const visible = await filterFor(req as AuthedRequest, this.prisma);
      res.status(200).set({ 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.flushHeaders();
      // the client reconnects by itself after 3 s and then reloads what it shows (events missed meanwhile)
      res.write('retry: 3000\n\n');
      res.write(`event: ready\ndata: {}\n\n`);
      const sub = this.events.stream.subscribe((e) => {
        if (visible(e)) res.write(`event: ${e.type}\ndata: ${wire(e)}\n\n`);
      });
      const beat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);
      req.on('close', () => {
        clearInterval(beat);
        sub.unsubscribe();
        res.end();
      });
    }
  }
  return EventsController;
};

const ClientEvents = streamController('client', async (r) => (e) => e.userId === r.auth?.userId);
// partner: own organisation; sales — only their cities / products (same rule as /partner/application/find)
const PartnerEvents = streamController('partner', async (r, prisma) => {
  const a = r.auth;
  const types = a?.scopeProducts.length
    ? (await prisma.partnerProduct.findMany({ where: { id: { in: a.scopeProducts } }, select: { productTypeId: true } })).map((p) => p.productTypeId)
    : null;
  return (e) =>
    e.organizationId === a?.organizationId &&
    (!a.scopeCities.length || (e.cityId !== null && a.scopeCities.includes(e.cityId))) &&
    (!types || types.includes(e.productTypeId));
});
const AdminEvents = streamController('admin', async () => () => true);

@Global()
@Module({ controllers: [ClientEvents, PartnerEvents, AdminEvents], providers: [EventsService], exports: [EventsService] })
export class EventsModule {}
