import { calcOffer } from '@loans/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api';
import { orgColor, orgMark } from '../session';
import { money } from '../ui';
import { App, AppOrg, changeOrg, useStatus } from './cabinet';

// Offers side by side (prototype #compare): one column per offer, best value highlighted,
// filter by state (to confirm / accepted / declined), ✓ / ✕ on offers still waiting for an answer.

const ICONS = {
  offer: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5.5M12 16.5h.01" />
    </svg>
  ),
  accepted: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12l3 3 5-6" />
    </svg>
  ),
  declined: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M15 9l-6 6M9 9l6 6" />
    </svg>
  ),
};
const FILLED = {
  accepted: (
    <svg viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" fill="currentColor" />
      <path d="M8 12l3 3 5-6" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  declined: (
    <svg viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" fill="currentColor" />
      <path d="M15 9l-6 6M9 9l6 6" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  ),
};
type Kind = keyof typeof ICONS;
const FILTERS: [Kind, string][] = [
  ['offer', 'დასადასტურებელი'],
  ['accepted', 'დადასტურებული'],
  ['declined', 'უარყოფილი'],
];
/** Which column of the filter a record belongs to: waiting for an answer / accepted (or issued) / everything closed. */
const kindOf = (o: AppOrg): Kind => (o.Status === 'offer' ? 'offer' : ['accepted', 'done'].includes(o.Status) ? 'accepted' : 'declined');

export function Compare({ app, onBack }: { app: App; onBack: () => void }) {
  const qc = useQueryClient();
  const s = useStatus();
  const q = useQuery({ queryKey: ['app', app.ID], queryFn: () => api<App>('GET', `/client/application/detail/${app.ID}/${app.UID}`), initialData: app });
  const a = q.data;
  const [filter, setFilter] = useState<Kind[]>(['offer', 'accepted', 'declined']);
  // only organisations that sent an offer can be compared; one column per offer
  const withOffers = a.Orgs.filter((o) => o.Offers.length);
  const cols = FILTERS.flatMap(([k]) => (filter.includes(k) ? withOffers.filter((o) => kindOf(o) === k) : [])).flatMap((o) =>
    o.Offers.map((t) => ({ o, t, c: calcOffer({ amount: t.Amount, months: t.Months, rate: t.Rate, fee: t.Fee, insMonth: t.InsMonth })! })),
  );
  const dense = cols.length >= 5;
  const run = async (o: AppOrg, to: string | undefined) => {
    if (!to) return;
    await changeOrg(o, to).catch(() => undefined);
    await q.refetch();
    qc.invalidateQueries({ queryKey: ['apps'] });
  };
  const row = (label: string, vals: number[], f: (v: number) => string, best = false, cls = '') => {
    const min = Math.min(...vals);
    const mark = best && vals.filter((v) => v === min).length < vals.length;
    return (
      <tr className={cls}>
        <td>{label}</td>
        {vals.map((v, i) => (
          <td key={i} className={mark && v === min ? 'best' : undefined}>
            {f(v)}
          </td>
        ))}
      </tr>
    );
  };
  const m = (v: number) => money(v, a.Currency);

  return (
    <section className="partners compare">
      <div className="wrap">
        <div className="cmp-head">
          <button type="button" className="btn btn-ghost" onClick={onBack}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
              <path d="M15 6l-6 6 6 6" />
            </svg>
            უკან
          </button>
          <p className="cmp-sub">
            {a.ProductType.NameKa} · <b>{money(a.Amount, a.Currency)}</b>
          </p>
          <h2 className="sec-title">შეთავაზებები</h2>
        </div>
        <div className="cmp-filter">
          {FILTERS.map(([k, label]) => {
            const on = filter.includes(k);
            return (
              <button key={k} type="button" className={`cmp-f f-${k}${on ? ' on' : ''}`} aria-pressed={on} onClick={() => setFilter(on ? filter.filter((x) => x !== k) : [...filter, k])}>
                <span className="ico">{ICONS[k]}</span>
                <span>{label}</span>
                <span className="cnt">{withOffers.filter((o) => kindOf(o) === k).length}</span>
              </button>
            );
          })}
        </div>
        {cols.length ? (
          <div className="cmp-wrap">
            <table className={`cmp${dense ? ' dense' : ''}`} style={{ minWidth: (dense ? 227 : 252) + cols.length * (dense ? 130 : 160) }}>
              <thead>
                <tr>
                  <th />
                  {cols.map(({ o, t }) => (
                    <th key={t.ID}>
                      <span className="lg" style={{ ['--c' as string]: orgColor(o.Organization) }}>
                        {orgMark(o.Organization.NameKa)}
                      </span>
                      {o.Organization.NameKa}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {row('თანხა', cols.map((x) => x.t.Amount), m)}
                {row('ვადა', cols.map((x) => x.t.Months), (v) => `${v} თვე`)}
                {row('წლიური განაკვეთი', cols.map((x) => x.t.Rate), (v) => `${v}%`, true)}
                {row('ეფექტური პროცენტი', cols.map((x) => x.c.eff), (v) => `${v}%`, true)}
                {row('ერთჯერადი საკომისიოები', cols.map((x) => x.t.Fee), m, true)}
                {row('ყოველთვიური გადასახადი', cols.map((x) => x.c.monthly), m, true)}
                {row('სულ გადასახდელი პროცენტი', cols.map((x) => x.c.interest), m, true)}
                {row('სულ გადასახდელი დაზღვევა', cols.map((x) => x.c.insTotal), m, true)}
                {row('სულ ძირის გარდა გადასახდელი', cols.map((x) => x.c.costTotal), m, true)}
                {row('სულ გადასახდელი', cols.map((x) => x.c.total), m, true, 'total')}
                <tr>
                  <td />
                  {cols.map(({ o, t }) => {
                    const k = kindOf(o);
                    return (
                      <td key={t.ID}>
                        <div className="acts">
                          {k === 'offer' ? (
                            <>
                              <button type="button" className="cab-ico cmp-ok" title="დადასტურება" aria-label="დადასტურება" onClick={() => run(o, s.acceptOf(o))}>
                                {ICONS.accepted}
                              </button>
                              <button type="button" className="cab-ico cmp-no" title="უარი" aria-label="უარი" onClick={() => run(o, s.cancelOf(o))}>
                                {ICONS.declined}
                              </button>
                            </>
                          ) : (
                            <span className={`cmp-st ${k}`} title={s.label(o.Status)}>
                              {FILLED[k]}
                            </span>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <p className="cmp-empty">ამ კატეგორიაში შეთავაზება არ არის</p>
        )}
      </div>
    </section>
  );
}
