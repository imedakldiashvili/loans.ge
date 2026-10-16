import { describe, expect, it } from 'vitest';
import { calcOffer } from '../src';

describe('calcOffer', () => {
  it('computes an annuity without fee or insurance (effective = nominal compounded)', () => {
    const c = calcOffer({ amount: 10000, months: 12, rate: 12 })!;
    expect(c.monthly).toBe(888); // 888.49
    expect(c.interest).toBe(662);
    expect(c.total).toBe(10662);
    expect(c.eff).toBe(12.7); // (1.01)^12 − 1
  });

  it('raises the effective rate with fee and insurance', () => {
    const c = calcOffer({ amount: 10000, months: 12, rate: 12, fee: 200, insMonth: 20 })!;
    expect(c.monthly).toBe(908);
    expect(c.insTotal).toBe(240);
    expect(c.costTotal).toBe(200 + 662 + 240);
    expect(c.total).toBe(10000 + 662 + 240 + 200);
    expect(c.eff).toBeGreaterThan(12.7);
  });

  it('handles a zero rate', () => {
    const c = calcOffer({ amount: 1200, months: 12, rate: 0 })!;
    expect(c.monthly).toBe(100);
    expect(c.interest).toBe(0);
    expect(c.eff).toBe(0);
  });

  it('returns null for missing amount or term', () => {
    expect(calcOffer({ amount: 0, months: 12, rate: 10 })).toBeNull();
    expect(calcOffer({ amount: 1000, months: 0, rate: 10 })).toBeNull();
  });
});
