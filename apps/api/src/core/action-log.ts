import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { PrismaService } from './prisma.service';
import { requestContext, RequestContext } from './request-context';

// Every API call gets a UID and is logged — STANDARDS.md §4.
// action_log + action_log_request + action_log_response, linked by uid only; written after the response is sent.

// `dev` exists only in test environments (DEV_OUTBOX=true)
const GATEWAYS = new Set(['public', 'client', 'partner', 'admin', 'dev']);
const UID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Keys whose values are replaced with *** before logging (secrets only — everything else is kept). */
const SECRET_KEYS = new Set(['otp', 'otpcode', 'token', 'accesstoken', 'refreshtoken', 'apikey', 'secret', 'webhooksecret', 'password']);
const HEADERS_KEPT = ['accept-language', 'user-agent', 'content-type', 'content-length', 'x-request-uid'];

export const maskSecrets = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(maskSecrets);
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, SECRET_KEYS.has(k.toLowerCase()) ? '***' : maskSecrets(x)]));
  }
  return v;
};

/** /{gateway}/{module}/{action}/{id}/{uid} — find/{page}/{size} carries no item. */
export const parsePath = (path: string) => {
  const [gateway, module, action, a, b] = path.split('?')[0].split('/').filter(Boolean);
  const known = gateway && GATEWAYS.has(gateway);
  const withItem = known && action !== 'find' && a && /^\d+$/.test(a) && b && UID_RX.test(b);
  return {
    gateway: known ? gateway : null,
    module: known ? module ?? null : null,
    action: known ? action ?? null : null,
    itemId: withItem ? BigInt(a) : null,
    itemUid: withItem ? b : null,
  };
};

@Injectable()
export class ActionLogMiddleware implements NestMiddleware {
  private readonly log = new Logger('ActionLog');

  constructor(private readonly prisma: PrismaService) {}

  use(req: Request, res: Response, next: NextFunction) {
    const incoming = req.header('x-request-uid');
    const uid = incoming && UID_RX.test(incoming) ? incoming : randomUUID();
    const p = parsePath(req.originalUrl);
    const ctx: RequestContext = {
      uid, startedOn: new Date(), gateway: p.gateway, module: p.module, action: p.action, userId: null, userProfileId: null, actorType: null,
    };
    res.setHeader('X-Request-Uid', uid);

    // capture the response body
    let responseBody: unknown;
    const json = res.json.bind(res);
    res.json = (body: unknown) => {
      responseBody = body;
      return json(body);
    };

    res.on('finish', () => {
      setImmediate(() => this.write(ctx, req, res, responseBody, p).catch((e) => this.log.error(`write failed for ${uid}: ${e?.message ?? e}`)));
    });
    requestContext.run(ctx, () => next());
  }

  private async write(ctx: RequestContext, req: Request, res: Response, body: unknown, p: ReturnType<typeof parsePath>) {
    const completedOn = new Date();
    const r = (body ?? {}) as { IsSuccess?: boolean; Data?: { ID?: number; UID?: string } | null; Error?: { Code?: string; Message?: string } | null };
    // add returns { ID, UID } — use it when the URL has no item
    const itemId = p.itemId ?? (typeof r.Data?.ID === 'number' && typeof r.Data?.UID === 'string' ? BigInt(r.Data.ID) : null);
    const itemUid = p.itemUid ?? (itemId !== null && typeof r.Data?.UID === 'string' ? r.Data.UID : null);
    const headers = Object.fromEntries(HEADERS_KEPT.filter((h) => req.headers[h] !== undefined).map((h) => [h, req.headers[h]]));
    const isMultipart = String(req.headers['content-type'] ?? '').startsWith('multipart/');

    await this.prisma.$transaction([
      this.prisma.actionLog.create({
        data: {
          uid: ctx.uid, url: req.originalUrl, method: req.method, gateway: ctx.gateway, module: ctx.module, action: ctx.action,
          itemId, itemUid, createdBy: ctx.userId, userProfileId: ctx.userProfileId, actorType: ctx.actorType,
          createdOn: ctx.startedOn, completedOn, durationMs: completedOn.getTime() - ctx.startedOn.getTime(),
          responseCode: res.statusCode, isSuccess: r.IsSuccess ?? res.statusCode < 400,
          errorCode: r.Error?.Code ?? null, errorMessage: r.Error?.Message ?? null,
          ip: req.ip ?? null, userAgent: req.header('user-agent') ?? null,
        },
      }),
      this.prisma.actionLogRequest.create({
        data: {
          uid: ctx.uid, headers, query: maskSecrets(req.query) as object,
          // files are not stored — only their description (filled by the upload handler later)
          body: isMultipart ? { file: 'multipart' } : ((maskSecrets(req.body) as object) ?? undefined),
          createdOn: ctx.startedOn,
        },
      }),
      this.prisma.actionLogResponse.create({
        data: { uid: ctx.uid, responseCode: res.statusCode, body: (maskSecrets(body) as object) ?? undefined, createdOn: completedOn },
      }),
    ]);
  }
}
