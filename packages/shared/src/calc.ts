// Offer calculation — annuity payment, totals and effective annual rate.
// Same method as the prototypes (admin `calcOffer`, partner `terms`, customer `demoTerms`), now in one place.

export interface OfferTerms {
  /** Loan amount. */
  amount: number;
  /** Term in months. */
  months: number;
  /** Nominal annual rate, %. */
  rate: number;
  /** One-off fee, in money. */
  fee?: number;
  /** Insurance per month, in money. */
  insMonth?: number;
}

export interface OfferCalc {
  /** Monthly payment including insurance. */
  monthly: number;
  /** Total interest paid. */
  interest: number;
  /** Total insurance paid. */
  insTotal: number;
  /** Everything paid except the principal (fee + interest + insurance). */
  costTotal: number;
  /** Total paid: principal + interest + insurance + fee. */
  total: number;
  /** Effective annual rate, % with one decimal (accounts for fee and insurance). */
  eff: number;
}

/** Monthly rate i such that the present value of `payment` over `n` months equals `cash` (bisection). */
const monthlyIrr = (cash: number, payment: number, n: number): number => {
  let lo = 0;
  let hi = 1;
  for (let k = 0; k < 60; k++) {
    const mid = (lo + hi) / 2;
    const pv = (payment * (1 - Math.pow(1 + mid, -n))) / mid;
    if (pv > cash) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
};

export const calcOffer = (t: OfferTerms): OfferCalc | null => {
  const amt = +t.amount || 0;
  const n = Math.round(+t.months || 0);
  const r = (+t.rate || 0) / 1200;
  const fee = +(t.fee ?? 0) || 0;
  const ins = +(t.insMonth ?? 0) || 0;
  if (amt <= 0 || n <= 0) return null;
  const pay = r ? (amt * r) / (1 - Math.pow(1 + r, -n)) : amt / n;
  const monthly = pay + ins;
  const interest = pay * n - amt;
  const insTotal = ins * n;
  const eff = (Math.pow(1 + monthlyIrr(amt - fee, monthly, n), 12) - 1) * 100;
  return {
    monthly: Math.round(monthly),
    interest: Math.round(interest),
    insTotal: Math.round(insTotal),
    costTotal: Math.round(fee + interest + insTotal),
    total: Math.round(amt + interest + insTotal + fee),
    eff: Math.round(eff * 10) / 10,
  };
};
