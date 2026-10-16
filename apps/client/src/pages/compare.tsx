import { n, t, up } from '../i18n';
import { calcOffer } from '@loans/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, ApiError } from '../api';
import { orgColor, orgMark } from '../session';
import { money } from '../ui';
import { App, AppOrg, MarkBar, MarkButtons, useOfferMarks, useStatus } from './cabinet';

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
  ['offer', 'გამოგზავნილი'],
  ['accepted', 'დადასტურებული'],
  ['declined', 'უარყოფილი'],
];
/** Which column of the filter a record belongs to: waiting for an answer / accepted (or issued) / everything closed. */
const kindOf = (o: AppOrg): Kind => (o.Status === 'offer' ? 'offer' : ['accepted', 'done'].includes(o.Status) ? 'accepted' : 'declined');

/** Opened at /cabinet/compare/{id}/{uid} — loads the application itself (a reload or a shared link works). */
export function Compare({ id, uid, onBack }: { id: number; uid: string; onBack: () => void }) {
  const qc = useQueryClient();
  const s = useStatus();
  const q = useQuery({ queryKey: ['app', id], queryFn: () => api<App>('GET', `/client/application/detail/${id}/${uid}`) });
  const [filter, setFilter] = useState<Kind[]>(['offer', 'accepted', 'declined']);
  const a = q.data;
  if (!a) return <section className="partners compare"><div className="wrap"><p className="cmp-empty">{t(q.isError ? 'შეცდომა' : 'იტვირთება…')}</p></div></section>;
  // only organisations that sent an offer can be compared; one column per offer
  const withOffers = a.Orgs.filter((o) => o.Offers.length);
  const cols = FILTERS.flatMap(([k]) => (filter.includes(k) ? withOffers.filter((o) => kindOf(o) === k) : [])).flatMap((o) =>
    o.Offers.map((of) => ({ o, of, c: calcOffer({ amount: of.Amount, months: of.Months, rate: of.Rate, fee: of.Fee, insMonth: of.InsMonth })! })),
  );
  const dense = cols.length >= 5;
  // marks: choose / cancel per organisation (several offer columns of one organisation share it), sent together
  const marks = useOfferMarks(a, () => {
    void q.refetch();
    void qc.invalidateQueries({ queryKey: ['apps'] });
  });
  const answerable = marks.answerable;
  const row = (label: string, vals: number[], f: (v: number) => string, best = false, cls = '') => {
    const min = Math.min(...vals);
    const mark = best && vals.filter((v) => v === min).length < vals.length;
    return (
      <tr className={cls}>
        <td>{t(label)}</td>
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
        <div className="cmp-filter">
          {FILTERS.map(([k, label]) => {
            const on = filter.includes(k);
            return (
              <button key={k} type="button" className={`cmp-f f-${k}${on ? ' on' : ''}`} aria-pressed={on} onClick={() => setFilter(on ? filter.filter((x) => x !== k) : [...filter, k])}>
                <span className="ico">{ICONS[k]}</span>
                <span>{t(label)}</span>
                <span className="cnt">{withOffers.filter((o) => kindOf(o) === k).length}</span>
              </button>
            );
          })}
        </div>
        {answerable.length > 0 && <MarkBar m={marks} />}
        {cols.length ? (
          <div className="cmp-wrap">
            <table className={`cmp${dense ? ' dense' : ''}`} style={{ minWidth: (dense ? 227 : 252) + cols.length * (dense ? 130 : 160) }}>
              <thead>
                <tr>
                  <th />
                  {cols.map(({ o, of }) => (
                    <th key={of.ID}>
                      <span className="lg" style={{ ['--c' as string]: orgColor(o.Organization) }}>
                        {orgMark(o.Organization.NameKa)}
                      </span>
                      {n(o.Organization)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {row('თანხა', cols.map((x) => x.of.Amount), m)}
                {row('ვადა', cols.map((x) => x.of.Months), (v) => t(`${v} თვე`))}
                {row('წლიური განაკვეთი', cols.map((x) => x.of.Rate), (v) => `${v}%`, true)}
                {row('ეფექტური პროცენტი', cols.map((x) => x.c.eff), (v) => `${v}%`, true)}
                {row('ერთჯერადი საკომისიოები', cols.map((x) => x.of.Fee), m, true)}
                {row('ყოველთვიური გადასახადი', cols.map((x) => x.c.monthly), m, true)}
                {row('სულ გადასახდელი პროცენტი', cols.map((x) => x.c.interest), m, true)}
                {row('სულ გადასახდელი დაზღვევა', cols.map((x) => x.c.insTotal), m, true)}
                {row('სულ ძირის გარდა გადასახდელი', cols.map((x) => x.c.costTotal), m, true)}
                {row('სულ გადასახდელი', cols.map((x) => x.c.total), m, true, 'total')}
                <tr>
                  <td />
                  {cols.map(({ o, of }) => {
                    const k = kindOf(o);
                    return (
                      <td key={of.ID}>
                        <div className="acts">
                          {k === 'offer' && answerable.includes(o) ? (
                            <MarkButtons o={o} m={marks} />
                          ) : (
                            <span className={`cmp-st ${k}`} title={s.label(o.Status)}>
                              {k === 'offer' ? ICONS.offer : FILLED[k]}
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
          <p className="cmp-empty">{t('ამ კატეგორიაში შეთავაზება არ არის')}</p>
        )}
      </div>
    </section>
  );
}
