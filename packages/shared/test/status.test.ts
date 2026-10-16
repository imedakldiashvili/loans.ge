import { describe, expect, it } from 'vitest';
import { DEFAULT_STATUS_CONFIG, StatusMachine, type StatusConfig } from '../src';

const m = new StatusMachine(DEFAULT_STATUS_CONFIG);

describe('status machine (default configuration)', () => {
  it('follows the main flow', () => {
    expect(m.canTransition('sent', 'interested', 'partner')).toBe(true);
    expect(m.canTransition('interested', 'offer', 'partner')).toBe(true);
    // no confirmation by the customer: the partner completes the offer
    expect(m.canTransition('offer', 'done', 'partner')).toBe(true);
  });

  it('rejects transitions by the wrong actor or from the wrong status', () => {
    expect(m.canTransition('offer', 'done', 'customer')).toBe(false);
    expect(m.status('accepted')).toBeUndefined();
    expect(m.canTransition('sent', 'offer', 'partner')).toBe(false);
    expect(m.canTransition('done', 'cancelled', 'partner')).toBe(false);
    expect(m.canTransition('expired', 'interested', 'partner')).toBe(false);
  });

  it('keeps partner and customer cancellation apart', () => {
    expect(m.canTransition('offer', 'cancelled', 'partner')).toBe(true);
    expect(m.canTransition('offer', 'cancelled', 'customer')).toBe(false);
    expect(m.canTransition('sent', 'declined', 'customer')).toBe(true);
    expect(m.canTransition('sent', 'declined', 'partner')).toBe(false);
  });

  it('asks for the right reason list', () => {
    expect(m.reasonKindFor('sent', 'cancelled', 'partner')).toBe('reject');
    expect(m.reasonKindFor('offer', 'cancelled', 'partner')).toBe('cancel');
    expect(m.reasonKindFor('offer', 'declined', 'customer')).toBeNull();
  });

  it('lists next statuses per actor in status order', () => {
    expect(m.nextStatuses('offer', 'customer')).toEqual(['declined']);
    expect(m.nextStatuses('offer', 'partner')).toEqual(['done', 'cancelled']);
    expect(m.nextStatuses('sent', 'partner')).toEqual(['interested', 'cancelled']);
    expect(m.nextStatuses('done', 'partner')).toEqual([]);
  });

  it('computes expiry from the status time limit', () => {
    const at = new Date('2026-10-15T10:00:00Z');
    expect(m.expiresAt('sent', at)?.toISOString()).toBe('2026-10-15T11:00:00.000Z');
    expect(m.expiresAt('offer', at)?.toISOString()).toBe('2026-10-16T10:00:00.000Z');
    expect(m.expiresAt('done', at)).toBeNull();
    expect(m.expiryTarget()).toBe('expired');
  });

  it('reads behaviour from flags', () => {
    expect(m.hidesPersonalData('sent')).toBe(true);
    expect(m.hidesPersonalData('interested')).toBe(false);
    expect(m.status('offer')?.flags.requiresOffer).toBe(true);
  });

  it('derives the application state from its organisations', () => {
    expect(m.applicationState(['offer', 'cancelled'])).toBe('active');
    expect(m.applicationState(['done', 'declined', 'expired'])).toBe('done');
    expect(m.isFinal('expired')).toBe(true);
  });
});

describe('status machine (edited configuration)', () => {
  it('follows changes made in the database', () => {
    const cfg: StatusConfig = structuredClone(DEFAULT_STATUS_CONFIG);
    cfg.statuses.find((s) => s.key === 'sent')!.ttlMinutes = 15;
    cfg.transitions.push({ from: 'sent', to: 'offer', by: 'partner', reasonKind: null, isEnable: true });
    cfg.transitions.find((t) => t.from === 'offer' && t.to === 'declined')!.isEnable = false;
    const e = new StatusMachine(cfg);
    expect(e.expiresAt('sent', new Date('2026-10-15T10:00:00Z'))?.toISOString()).toBe('2026-10-15T10:15:00.000Z');
    expect(e.canTransition('sent', 'offer', 'partner')).toBe(true);
    expect(e.canTransition('offer', 'declined', 'customer')).toBe(false);
  });

  it('ignores disabled statuses and their transitions', () => {
    const cfg: StatusConfig = structuredClone(DEFAULT_STATUS_CONFIG);
    cfg.statuses.find((s) => s.key === 'interested')!.isEnable = false;
    const e = new StatusMachine(cfg);
    expect(e.status('interested')).toBeUndefined();
    expect(e.nextStatuses('sent', 'partner')).toEqual(['cancelled']);
  });
});
