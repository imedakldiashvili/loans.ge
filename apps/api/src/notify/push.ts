import { Body, Controller, Get, Headers, Injectable, Logger, OnModuleInit, Post } from '@nestjs/common';
import webpush from 'web-push';
import { z } from 'zod';
import { parse } from '../core/crud';
import { AppError } from '../core/errors';
import { PrismaService } from '../core/prisma.service';
import { currentContext } from '../core/request-context';

// Browser notifications (Web Push): arrive even when the cabinet tab is closed.
// VAPID keys: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (+ VAPID_SUBJECT) in production; in development they are
// generated once and kept in the `setting` table (key "vapid") so subscriptions survive restarts.

export interface PushMessage {
  title: string;
  body?: string;
  /** opened on click (relative to the app) */
  url?: string;
  tag?: string;
}

@Injectable()
export class PushService implements OnModuleInit {
  private readonly log = new Logger('Push');
  private publicKey: string | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    let pub = process.env.VAPID_PUBLIC_KEY;
    let priv = process.env.VAPID_PRIVATE_KEY;
    if (!pub || !priv) {
      if (process.env.NODE_ENV === 'production') {
        this.log.warn('VAPID keys are not set — browser notifications are off');
        return;
      }
      const row = await this.prisma.setting.findFirst({ where: { key: 'vapid', isDeleted: false } });
      let v = row?.value as { publicKey: string; privateKey: string } | undefined;
      if (!v?.publicKey) {
        v = webpush.generateVAPIDKeys();
        await this.prisma.setting.create({ data: { key: 'vapid', value: v } }); // development only; production uses VAPID_* env
      }
      pub = v.publicKey;
      priv = v.privateKey;
    }
    webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? 'mailto:support@loans.ge', pub, priv);
    this.publicKey = pub;
  }

  key() {
    return { publicKey: this.publicKey };
  }

  /** To every browser the profiles subscribed from; gone subscriptions are removed. */
  async send(profileIds: bigint[], m: PushMessage) {
    if (!this.publicKey || !profileIds.length) return;
    const subs = await this.prisma.pushSubscription.findMany({ where: { userProfileId: { in: profileIds }, isDeleted: false } });
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(m), { TTL: 3600 });
          await this.prisma.pushSubscription.update({ where: { id: s.id }, data: { lastSentOn: new Date() } });
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) await this.prisma.pushSubscription.update({ where: { id: s.id }, data: { isDeleted: true } });
          else this.log.warn(`push failed (${code ?? '?'}): ${(e as Error).message}`);
        }
      }),
    );
  }

  async subscribe(body: unknown, userAgent?: string) {
    const d = parse(z.object({ endpoint: z.string().url(), keys: z.object({ p256dh: z.string().min(10), auth: z.string().min(5) }) }), body);
    const profileId = currentContext()?.userProfileId;
    if (!profileId) throw new AppError('UNAUTHORIZED', 'საჭიროა ავტორიზაცია');
    const row = await this.prisma.pushSubscription.upsert({
      where: { endpoint: d.endpoint },
      create: { userProfileId: profileId, endpoint: d.endpoint, p256dh: d.keys.p256dh, auth: d.keys.auth, userAgent: userAgent ?? null },
      update: { userProfileId: profileId, p256dh: d.keys.p256dh, auth: d.keys.auth, userAgent: userAgent ?? null, isDeleted: false },
    });
    return { id: row.id, uid: row.uid };
  }

  async unsubscribe(body: unknown) {
    const d = parse(z.object({ endpoint: z.string().url() }), body);
    const profileId = currentContext()?.userProfileId ?? BigInt(-1);
    const row = await this.prisma.pushSubscription.findFirst({ where: { endpoint: d.endpoint, userProfileId: profileId } });
    if (row) await this.prisma.pushSubscription.update({ where: { id: row.id }, data: { isDeleted: true } });
    return row ? { id: row.id, uid: row.uid } : null;
  }
}

@Controller('public/push')
export class PublicPushController {
  constructor(private readonly push: PushService) {}

  /** VAPID public key for PushManager.subscribe (null when push is off). */
  @Get('key')
  key() {
    return this.push.key();
  }
}

const pushController = (gateway: 'partner' | 'client') => {
  @Controller(`${gateway}/push`)
  class GatewayPushController {
    constructor(readonly push: PushService) {}

    @Post('subscribe')
    subscribe(@Body() body: unknown, @Headers('user-agent') ua?: string) {
      return this.push.subscribe(body, ua);
    }

    @Post('unsubscribe')
    unsubscribe(@Body() body: unknown) {
      return this.push.unsubscribe(body);
    }
  }
  return GatewayPushController;
};
export const PUSH_CONTROLLERS = [PublicPushController, pushController('partner'), pushController('client')];
