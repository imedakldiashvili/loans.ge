import { Injectable } from '@nestjs/common';
import { StatusConfig, StatusMachine } from '@loans/shared';
import { PrismaService } from './prisma.service';

/** Status machine built from the `status` / `status_transition` tables (admin-managed). Reloaded every few seconds. */
@Injectable()
export class StatusConfigService {
  private cached: { at: number; machine: StatusMachine } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async machine(): Promise<StatusMachine> {
    if (this.cached && Date.now() - this.cached.at < 5_000) return this.cached.machine;
    const [statuses, transitions] = await Promise.all([
      this.prisma.status.findMany({ where: { isDeleted: false } }),
      this.prisma.statusTransition.findMany({ where: { isDeleted: false }, include: { fromStatus: true, toStatus: true } }),
    ]);
    const config: StatusConfig = {
      statuses: statuses.map((s) => ({
        key: s.key, category: s.category as 'progress', ttlMinutes: s.ttlMinutes, sort: s.sort, isEnable: s.isEnable,
        flags: { hidesPersonalData: s.hidesPersonalData, requiresOffer: s.requiresOffer, requiresIssued: s.requiresIssued, isExpiryTarget: s.isExpiryTarget, revealsContacts: s.revealsContacts },
        labels: { customerKa: s.customerKa, customerEn: s.customerEn, partner: s.partnerLabel, chip: s.chipLabel },
      })),
      transitions: transitions.map((t) => ({ from: t.fromStatus.key, to: t.toStatus.key, by: t.actor as 'partner', reasonKind: t.reasonKind as 'reject' | null, isEnable: t.isEnable })),
    };
    this.cached = { at: Date.now(), machine: new StatusMachine(config) };
    return this.cached.machine;
  }

  /** Statuses whose records hide the applicant's personal data from partners. */
  async hiddenKeys() {
    const m = await this.machine();
    return (await this.prisma.status.findMany({ where: { isDeleted: false, hidesPersonalData: true }, select: { key: true } })).map((s) => s.key).filter((k) => m.hidesPersonalData(k));
  }
}
