import { Body, Controller, Injectable, Logger, Module, OnModuleInit, Param, ParseIntPipe, Post, Put } from '@nestjs/common';
import { z } from 'zod';
import { parse } from '../core/crud';
import { notFound, validation } from '../core/errors';
import { PrismaService } from '../core/prisma.service';
import { currentContext } from '../core/request-context';
import { ApplicationEvent, EventsService } from '../events/events';
import { EmailSender, SmsSender } from './notifier';
import { PUSH_CONTROLLERS, PushService } from './push';

// Notifications about applications — who learns what, and how:
//   partner staff (their organisation; a free one — sales within their cities / products; a taken one — its taker; back office
//     always): a new application; the customer
//     accepted / declined; a deadline passed;
//   the customer: an organisation took the application into review, sent an offer, declined, issued the loan; a deadline passed.
// Channels: the bell (notification table, live over the events stream), browser push, and e-mail / SMS as set in
// admin → settings ("notify"). Nobody is notified about their own action.

interface NotifySettings {
  staffEmail: boolean;
  staffSms: boolean;
  customerEmail: boolean;
  customerSms: boolean;
}
const DEFAULTS: NotifySettings = { staffEmail: true, staffSms: false, customerEmail: false, customerSms: true };

const fmt = (n: number) => Math.round(n).toLocaleString('en-US').replace(/,/g, ' ');
const CUR: Record<string, string> = { GEL: '₾', USD: '$', EUR: '€' };

/** Texts per status change, for the side that did not make it. */
const CUSTOMER_TEXT: Record<string, (org: string) => string> = {
  interested: (o) => `${o} განიხილავს შენს განაცხადს`,
  offer: (o) => `${o}-მ შეთავაზება გამოგიგზავნა`,
  rejected: (o) => `${o}-მ განაცხადი უარყო`,
  cancelled: (o) => `${o}-მ შეთავაზება გააუქმა`,
  done: (o) => `${o}: სესხი გაცემულია`,
  expired: (o) => `${o}: ვადა გავიდა`,
};
const STAFF_TEXT: Record<string, string> = {
  accepted: 'მომხმარებელმა შეთავაზება დაადასტურა',
  declined: 'მომხმარებელმა შეთავაზება უარყო',
  withdrawn: 'მომხმარებელმა უარი თქვა',
  expired: 'განაცხადს ვადა გაუვიდა',
};

@Injectable()
export class AlertService implements OnModuleInit {
  private readonly log = new Logger('Notify');

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
    private readonly push: PushService,
    private readonly sms: SmsSender,
    private readonly email: EmailSender,
  ) {}

  onModuleInit() {
    this.events.applications.subscribe((e) => void this.handle(e).catch((err) => this.log.error(`notify failed: ${err?.message ?? err}`)));
  }

  private async settings(): Promise<NotifySettings> {
    const row = await this.prisma.setting.findFirst({ where: { key: 'notify', isDeleted: false } });
    return { ...DEFAULTS, ...((row?.value as Partial<NotifySettings> | undefined) ?? {}) };
  }

  private async handle(e: ApplicationEvent) {
    const ao = await this.prisma.applicationOrg.findUnique({
      where: { id: e.applicationOrgId },
      include: { organization: { select: { nameKa: true } }, application: { include: { productType: { select: { nameKa: true } } } } },
    });
    if (!ao) return;
    const a = ao.application;
    const what = `${a.productType.nameKa} · ${fmt(Number(a.amount))} ${CUR[a.currency] ?? a.currency}`;
    const base = { type: e.type, status: e.status, applicationId: a.id, applicationOrgId: ao.id };
    const cfg = await this.settings();

    // → partner staff
    const staffTitle = e.type === 'application.created' ? 'ახალი განაცხადი' : e.actor !== 'partner' ? STAFF_TEXT[e.status] : undefined;
    if (staffTitle) {
      const staff = await this.staffFor(e, ao.assignedToId);
      await this.deliver(staff.map((s) => s.id), { ...base, title: staffTitle, body: what }, '/');
      if (e.type === 'application.created') {
        const text = `loans.ge: ${staffTitle} — ${what}`;
        for (const s of staff) {
          if (cfg.staffEmail && s.user.email) await this.email.send(s.user.email, `loans.ge — ${staffTitle}`, text);
          if (cfg.staffSms && s.user.phone) await this.sms.send(s.user.phone, text);
        }
      }
    }

    // → the customer
    const customerText = e.type === 'application.status' && e.actor !== 'customer' ? CUSTOMER_TEXT[e.status]?.(ao.organization.nameKa) : undefined;
    if (customerText) {
      const profile = await this.prisma.userProfile.findFirst({
        where: { userId: a.userId, isDeleted: false, isEnable: true, profileType: { code: 'customer' } },
        include: { user: { select: { email: true, phone: true } } },
      });
      if (profile) {
        await this.deliver([profile.id], { ...base, title: customerText, body: what }, '/');
        if (e.status === 'offer') {
          const text = `loans.ge: ${customerText} — ${what}. ნახე კაბინეტში.`;
          if (cfg.customerSms && profile.user.phone) await this.sms.send(profile.user.phone, text);
          if (cfg.customerEmail && profile.user.email) await this.email.send(profile.user.email, `loans.ge — ${customerText}`, text);
        }
      }
    }
  }

  /** Enabled staff of the organisation who see the record: back office; sales — free: within their cities / products, taken: its taker. */
  private async staffFor(e: ApplicationEvent, assignedToId: bigint | null) {
    const staff = await this.prisma.userProfile.findMany({
      where: { organizationId: e.organizationId, isDeleted: false, isEnable: true, profileType: { code: 'staff' }, user: { isDeleted: false, isEnable: true } },
      include: { user: { select: { email: true, phone: true } } },
    });
    if (assignedToId) return staff.filter((s) => s.role !== 'sales' || s.id === assignedToId);
    const productIds = [...new Set(staff.flatMap((s) => (s.role === 'sales' ? s.scopeProducts : [])))];
    const types = productIds.length ? await this.prisma.partnerProduct.findMany({ where: { id: { in: productIds } }, select: { id: true, productTypeId: true } }) : [];
    return staff.filter((s) => {
      if (s.role !== 'sales') return true;
      if (s.scopeCities.length && (e.cityId === null || !s.scopeCities.includes(e.cityId))) return false;
      if (s.scopeProducts.length && !types.some((t) => s.scopeProducts.includes(t.id) && t.productTypeId === e.productTypeId)) return false;
      return true;
    });
  }

  /** Bell (+ live) and browser push for the profiles. */
  private async deliver(profileIds: bigint[], n: { type: string; status: string; title: string; body: string; applicationId: bigint; applicationOrgId: bigint }, url: string) {
    if (!profileIds.length) return;
    for (const id of profileIds) {
      const row = await this.prisma.notification.create({ data: { userProfileId: id, ...n } });
      this.events.publish({ type: 'notification', userProfileId: id, notificationId: row.id });
    }
    await this.push.send(profileIds, { title: n.title, body: n.body, url, tag: `ao-${n.applicationOrgId}` });
  }

  // ── the bell: own notifications

  private me() {
    return currentContext()?.userProfileId ?? BigInt(-1);
  }

  async find(pageNumber: number, pageSize: number, body: unknown) {
    if (pageNumber < 1 || pageSize < 1 || pageSize > 100) throw validation([{ field: 'PageSize', message: '1-დან 100-მდე' }]);
    const { filter: f } = parse(z.preprocess((v) => v ?? {}, z.object({ filter: z.preprocess((v) => v ?? {}, z.object({ unread: z.boolean().optional() })) })), body);
    const where = { userProfileId: this.me(), isDeleted: false, ...(f.unread ? { readOn: null } : {}) };
    const [items, totalCount, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({ where, orderBy: { createdOn: 'desc' }, skip: (pageNumber - 1) * pageSize, take: pageSize }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userProfileId: this.me(), isDeleted: false, readOn: null } }),
    ]);
    return { items, pageNumber, pageSize, totalCount, totalPages: Math.ceil(totalCount / pageSize), unreadCount };
  }

  async read(id: number, uid: string) {
    const row = await this.prisma.notification.findFirst({ where: { id: BigInt(id), uid, userProfileId: this.me(), isDeleted: false } });
    if (!row) throw notFound('შეტყობინება');
    if (!row.readOn) await this.prisma.notification.update({ where: { id: row.id }, data: { readOn: new Date() } });
    return { id: row.id, uid: row.uid };
  }

  async readAll() {
    const r = await this.prisma.notification.updateMany({ where: { userProfileId: this.me(), isDeleted: false, readOn: null }, data: { readOn: new Date() } });
    return { count: r.count };
  }
}

const notificationController = (gateway: 'partner' | 'client') => {
  @Controller(`${gateway}/notification`)
  class NotificationController {
    constructor(readonly svc: AlertService) {}

    /** Own notifications, newest first; UnreadCount for the bell. Filter: { Unread: true }. */
    @Post('find/:pageNumber/:pageSize')
    find(@Param('pageNumber', ParseIntPipe) p: number, @Param('pageSize', ParseIntPipe) s: number, @Body() body: unknown) {
      return this.svc.find(p, s, body);
    }

    @Put('read/:id/:uid')
    read(@Param('id', ParseIntPipe) id: number, @Param('uid') uid: string) {
      return this.svc.read(id, uid);
    }

    @Put('readAll')
    readAll() {
      return this.svc.readAll();
    }
  }
  return NotificationController;
};

@Module({
  controllers: [notificationController('partner'), notificationController('client'), ...PUSH_CONTROLLERS],
  providers: [AlertService, PushService],
})
export class AlertsModule {}
