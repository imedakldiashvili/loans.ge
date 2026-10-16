// Offer status machine — one record per application × organisation (prototype: `orgList` entry).
// Statuses and transitions live in the database (`status`, `status_transition`) and are managed from the admin console.
// This module holds the rules engine that reads that configuration, plus the defaults used to seed the database.
// The server validates every change with it; clients use the same code to decide which buttons to show.

export type StatusCategory = 'progress' | 'complete' | 'canceled';

export type Actor = 'customer' | 'partner' | 'system' | 'admin';

/** Which reason list the actor must pick from (reference data kind). */
export type ReasonKind = 'reject' | 'cancel';

/** Behaviour flags — code reacts to these, never to status keys. */
export interface StatusFlags {
  /** Partner does not see the applicant's personal data in this status (masked). */
  hidesPersonalData?: boolean;
  /** Entering this status requires at least one offer. */
  requiresOffer?: boolean;
  /** Entering this status requires the "loan issued" confirmation. */
  requiresIssued?: boolean;
  /** The worker moves expired records into this status (one per system). */
  isExpiryTarget?: boolean;
}

/** Row of the `status` table. */
export interface StatusDef {
  key: string;
  category: StatusCategory;
  /** Time limit in minutes; null = no limit. */
  ttlMinutes: number | null;
  sort: number;
  isEnable: boolean;
  flags: StatusFlags;
  /** Texts: customer KA/EN, partner label, short chip label. */
  labels: { customerKa: string; customerEn: string; partner: string; chip: string };
}

/** Row of the `status_transition` table. */
export interface TransitionDef {
  from: string;
  to: string;
  by: Actor;
  reasonKind: ReasonKind | null;
  isEnable: boolean;
}

export interface StatusConfig {
  statuses: StatusDef[];
  transitions: TransitionDef[];
}

/** Rules engine over a configuration loaded from the database. */
export class StatusMachine {
  private readonly byKey: Map<string, StatusDef>;
  private readonly transitions: TransitionDef[];

  constructor(config: StatusConfig) {
    this.byKey = new Map(config.statuses.filter((s) => s.isEnable).map((s) => [s.key, s]));
    this.transitions = config.transitions.filter((t) => t.isEnable && this.byKey.has(t.from) && this.byKey.has(t.to));
  }

  status(key: string): StatusDef | undefined {
    return this.byKey.get(key);
  }

  categoryOf(key: string): StatusCategory | undefined {
    return this.byKey.get(key)?.category;
  }

  isFinal(key: string): boolean {
    const c = this.categoryOf(key);
    return c !== undefined && c !== 'progress';
  }

  private find(from: string, to: string, by: Actor) {
    return this.transitions.find((t) => t.from === from && t.to === to && t.by === by);
  }

  canTransition(from: string, to: string, by: Actor): boolean {
    return !!this.find(from, to, by);
  }

  /** Reason list required for this transition, or null when no reason is needed. */
  reasonKindFor(from: string, to: string, by: Actor): ReasonKind | null {
    return this.find(from, to, by)?.reasonKind ?? null;
  }

  /** Statuses the actor may move to from `from`, in status order. */
  nextStatuses(from: string, by: Actor): string[] {
    return this.transitions
      .filter((t) => t.from === from && t.by === by)
      .map((t) => t.to)
      .sort((a, b) => this.byKey.get(a)!.sort - this.byKey.get(b)!.sort);
  }

  /** When a record in `key` expires; null when the status has no time limit. */
  expiresAt(key: string, statusAt: Date): Date | null {
    const min = this.byKey.get(key)?.ttlMinutes;
    return min ? new Date(statusAt.getTime() + min * 60_000) : null;
  }

  /** Status the worker moves an expired record into (the one flagged `isExpiryTarget`). */
  expiryTarget(): string | undefined {
    return [...this.byKey.values()].find((s) => s.flags.isExpiryTarget)?.key;
  }

  hidesPersonalData(key: string): boolean {
    return !!this.byKey.get(key)?.flags.hidesPersonalData;
  }

  /** An application has only two states: active while at least one organisation is still in progress. */
  applicationState(keys: readonly string[]): 'active' | 'done' {
    return keys.some((k) => this.categoryOf(k) === 'progress') ? 'active' : 'done';
  }
}
