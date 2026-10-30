import { n, t, up } from '../i18n';
import { calcOffer } from '@loans/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, ApiError } from '../api';
import { OrgLogo } from '../session';
import { money } from '../ui';
import { App, AppOrg, MarkBar, MarkButtons, OfferNum, OfferRow, useOfferMarks, useStatus } from './cabinet';

// Offers side by side (prototype #compare): one column per offer, best value highlighted,
// filter by state (to confirm / accepted / declined); the ticked offers are accepted, the other waiting offers cancelled.

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
  rejected: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M15 9l-6 6M9 9l6 6" />
    </svg>
  ),
  waiting: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
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
  rejected: (
    <svg viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" fill="currentColor" />
      <path d="M15 9l-6 6M9 9l6 6" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  ),
};
type Kind = keyof typeof ICONS;
const FILTERS: [Kind, string][] = [
  ['offer', 'გამოგზავნილი'],
  ['waiting', 'ველოდებით'],
  ['rejected', 'უარყოფილი'],
];
/** Filter of a record: sent an offer (waiting for the answer, or already accepted / issued) / still working on it (no offer yet) /
 *  rejected or cancelled by the partner; the ones the customer declined or that expired are not compared. */
const kindOf = (o: AppOrg): Kind | null =>
  ['rejected', 'cancelled'].includes(o.Status) ? 'rejected' : o.Offers.length && ['offer', 'accepted', 'done'].includes(o.Status) ? 'offer' : ['sent', 'interested'].includes(o.Status) ? 'waiting' : null;

/** Opened at /cabinet/compare/{id}/{uid} — loads the application itself (a reload or a shared link works). */
export function Compare({ id, uid, onBack }: { id: number; uid: string; onBack: () => void }) {
  const q = useQuery({ queryKey: ['app', id], queryFn: () => api<App>('GET', `/client/application/detail/${id}/${uid}`) });
  if (!q.data) return <section className="partners compare"><div className="wrap"><p className="cmp-empty">{t(q.isError ? 'შეცდომა' : 'იტვირთება…')}</p></div></section>;
  // the page itself only once the application is there (its hooks must run on every render)
  return <CompareView a={q.data} onBack={onBack} reload={() => void q.refetch()} />;
}

function CompareView({ a, onBack, reload }: { a: App; onBack: () => void; reload: () => void }) {
  const qc = useQueryClient();
  const s = useStatus();
  // "waiting" and "rejected" are there, but off: their columns show only when turned on
  const [filter, setFilter] = useState<Kind[]>(['offer']);
  // marks: choose per organisation (several offer columns of one organisation share it), sent together;
  // once sent — back to the cabinet
  const marks = useOfferMarks(a, () => {
    reload();
    void qc.invalidateQueries({ queryKey: ['apps'] });
    onBack();
  });
  const answerable = marks.answerable;
  // a chosen offer's whole column is green (each offer on its own — one organisation may have sent several)
  const chosen = (of: OfferRow | null) => (of && marks.marks.has(of.ID) ? 'chosen' : '');
  // one column per offer; an organisation without an offer (waiting / rejected) — one empty column; the chosen ones move to the left
  // counts = columns: every offer is one (an organisation may have sent several), an organisation without one — one
  const count = (k: Kind) => a.Orgs.filter((o) => kindOf(o) === k).reduce((n, o) => n + Math.max(1, o.Offers.length), 0);
  type Col = { o: AppOrg; of: OfferRow | null; key: string; c: ReturnType<typeof calcOffer> | null };
  const cols = FILTERS.flatMap(([k]) => (filter.includes(k) ? a.Orgs.filter((o) => kindOf(o) === k) : []))
    .flatMap((o): Col[] =>
      o.Offers.length
        ? o.Offers.map((of) => ({ o, of, key: `of-${of.ID}`, c: calcOffer({ amount: of.Amount, months: of.Months, rate: of.Rate, fee: of.Fee, insMonth: of.InsMonth })! }))
        : [{ o, of: null, key: `org-${o.ID}`, c: null }],
    )
    .sort((x, y) => Number(!!chosen(y.of)) - Number(!!chosen(x.of)));
  const dense = cols.length >= 5;
  // a value of every column ("—" where there is no offer); the best one is marked among the offers only
  const row = (label: string, val: (x: Col) => number | undefined, f: (v: number) => string, best = false, cls = '') => {
    const vals = cols.map((x) => (x.of ? val(x) : undefined));
    const nums = vals.filter((v): v is number => v !== undefined);
    const min = Math.min(...nums);
    const mark = best && nums.filter((v) => v === min).length < nums.length;
    return (
      <tr className={cls}>
        <td>{t(label)}</td>
        {vals.map((v, i) => (
          <td key={cols[i].key} className={[mark && v === min ? 'best' : '', v === undefined ? 'none' : '', chosen(cols[i].of)].filter(Boolean).join(' ') || undefined}>
            {v === undefined ? '-' : f(v)}
          </td>
        ))}
      </tr>
    );
  };
  const m = (v: number) => money(v, a.Currency);
  /** A column's action: ✓ choose for an offer waiting for the answer, otherwise the status icon. */
  const action = (o: AppOrg, of: OfferRow | null) => {
    const k = kindOf(o);
    const done = ['accepted', 'done'].includes(o.Status);
    if (k === 'offer' && of && answerable.includes(o)) return <MarkButtons o={o} of={of} m={marks} />;
    return (
      <span className={`cmp-st ${done ? 'accepted' : k}`} title={s.label(o.Status)}>
        {done ? FILLED.accepted : k === 'rejected' ? FILLED.rejected : k === 'waiting' ? ICONS.waiting : ICONS.offer}
      </span>
    );
  };

  return (
    <section className="partners compare">
      <div className="wrap">
        <div className="cmp-head">
          <button type="button" className="btn btn-ghost" id="cmpBack" onClick={onBack}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
              <path d="M15 6l-6 6 6 6" />
            </svg>
            {t('უკან')}
          </button>
          <p className="cmp-sub">
            {n(a.ProductType)} · <b>{money(a.Amount, a.Currency)}</b>
          </p>
          <h2 className="sec-title">{up(t('შეთავაზებები'))}</h2>
        </div>
        {/* one line: the filters on the left, "chosen: n" + "finish comparison" on the right */}
        <div className="cmp-bar">
          <div className="cmp-filter">
            {FILTERS.map(([k, label]) => {
              const on = filter.includes(k);
              return (
                <button key={k} type="button" className={`cmp-f f-${k}${on ? ' on' : ''}`} aria-pressed={on} onClick={() => setFilter(on ? filter.filter((x) => x !== k) : [...filter, k])}>
                  <span className="ico">{ICONS[k]}</span>
                  <span>{t(label)}</span>
                  <span className="cnt">{count(k)}</span>
                </button>
              );
            })}
          </div>
          {answerable.length > 0 && <MarkBar m={marks} />}
        </div>
        {cols.length ? (
          <div className="cmp-wrap">
            <table className={`cmp${dense ? ' dense' : ''}`} style={{ minWidth: (dense ? 227 : 252) + cols.length * (dense ? 130 : 160) }}>
              <thead>
                <tr>
                  <th />
                  {cols.map(({ o, of, key }) => (
                    <th key={key} className={chosen(of) || undefined}>
                      <OrgLogo org={o.Organization} />
                      {n(o.Organization)}
                      {/* one organisation, several offers: which one */}
                      {of && o.Offers.length > 1 && <OfferNum o={o} of={of} i={o.Offers.indexOf(of)} />}
                      {/* choose (a waiting offer) or the status icon — under the name */}
                      <div className="acts">{action(o, of)}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {row('თანხა', (x) => x.of?.Amount, m)}
                {row('ვადა', (x) => x.of?.Months, (v) => t(`${v} თვე`))}
                {row('წლიური განაკვეთი', (x) => x.of?.Rate, (v) => `${v}%`, true)}
                {row('ეფექტური პროცენტი', (x) => x.c?.eff, (v) => `${v}%`, true)}
                {row('ერთჯერადი საკომისიოები', (x) => x.of?.Fee, m, true)}
                {row('ყოველთვიური გადასახადი', (x) => x.c?.monthly, m, true)}
                {row('სულ გადასახდელი პროცენტი', (x) => x.c?.interest, m, true)}
                {row('სულ გადასახდელი დაზღვევა', (x) => x.c?.insTotal, m, true)}
                {row('სულ ძირის გარდა გადასახდელი', (x) => x.c?.costTotal, m, true)}
                {row('სულ გადასახდელი', (x) => x.c?.total, m, true, 'total')}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="cmp-empty">{t('ამ კატეგორიაში შეთავაზება არ არის')}</p>
        )}
      </div>
    </section>
  );
}
