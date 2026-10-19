import { lang, n, refName, t, up } from '../i18n';
import { calcOffer } from '@loans/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError, Page, Ref } from '../api';
import { OtpModal } from '../auth';
import { OrgLogo, StatusRow, useRefs, useSession } from '../session';
import { Chevron, ErrorText, fmt, fmtCd, fmtDate, fmtDay, fmtPhone, Modal, money, useNow } from '../ui';

// Customer cabinet (prototype #cabinet): active / closed applications, per-organisation statuses and offers,
// application view, offer view with accept / decline, closing an application; profile.

export interface OfferRow {
  ID: number;
  Amount: number;
  Currency: string;
  Months: number;
  Rate: number;
  Fee: number;
  InsMonth: number;
  /** the customer chose this offer */
  ChosenOn?: string | null;
}
export interface AppOrg {
  ID: number;
  UID: string;
  Status: string;
  StatusOn: string;
  SentOn: string;
  OfferOn: string | null;
  ExpiresOn: string | null;
  Organization: { ID: number; NameKa: string; Color: string | null; LogoPath: string | null };
  Offers: OfferRow[];
  Next: string[];
}
export interface App {
  ID: number;
  UID: string;
  CreatedOn: string;
  Amount: number;
  Currency: string;
  ProductType: { NameKa: string };
  Pid: string;
  FirstName: string;
  LastName: string;
  BirthDate: string | null;
  Phone: string;
  CityID: number | null;
  DistrictID: number | null;
  Village: string | null;
  CreditHistory: string | null;
  Sector: string | null;
  Incomes: { Src: string; Amount: number }[] | null;
  Banks: string[] | null;
  Orgs: AppOrg[];
}
type Found = Page<App> & { Counts: { Active: number; Done: number } };

/** Order of the status groups in a card: what needs an answer first, closed ones last. */
const GROUP_ORDER = ['offer', 'interested', 'sent', 'accepted', 'done', 'cancelled', 'declined', 'rejected', 'withdrawn', 'expired'];
const OPEN_GROUPS = ['offer', 'accepted', 'interested'];const PAGE_SIZE = 5;
/** CSS of the prototype has no class for "expired" — it looks like "cancelled". */
/** An offer's number (an organisation sent several) in a filled frame coloured by its status:
 *  the organisation's status; an accepted organisation's offer that was not chosen — grey ("not chosen"). */
export function OfferNum({ o, of, i }: { o: AppOrg; of: OfferRow; i: number }) {
  const s = useStatus();
  const notChosen = ['accepted', 'done'].includes(o.Status) && !of.ChosenOn;
  return (
    <span className={`of-num ${notChosen ? 'cancelled' : stCls(o.Status)}`} title={notChosen ? t('არ არის არჩეული') : s.label(o.Status)}>
      {i + 1}
    </span>
  );
}

export const stCls = (k: string) => (k === 'expired' || k === 'rejected' ? 'cancelled' : k === 'withdrawn' ? 'declined' : k);
const errText = (e: unknown) => (e instanceof ApiError ? [e.message, ...e.details.map((d) => d.Message)].join(' — ') : t('შეცდომა'));

export const useStatus = () => {
  const { statuses } = useRefs();
  const st = (k: string): StatusRow | undefined => statuses.find((s) => s.Key === k);
  return {
    label: (k: string) => (lang() === 'en' ? st(k)?.CustomerEn : st(k)?.CustomerKa) ?? k,
    categoryOf: (k: string) => st(k)?.Category,
    /** next status of a record that cancels it / accepts it (allowed transitions come from the API) */
    cancelOf: (o: AppOrg) => o.Next.find((k) => st(k)?.Category === 'canceled'),
    acceptOf: (o: AppOrg) => o.Next.find((k) => st(k)?.Category !== 'canceled'),
  };
};

export const changeOrg = (o: AppOrg, status: string) => api<Ref>('PUT', `/client/applicationOrg/changeStatus/${o.ID}/${o.UID}`, { Status: status });

type CabView = 'active' | 'done' | 'profile';
/** The view comes from the address: /cabinet, /cabinet/closed, /cabinet/profile. */
const PATHS: Record<CabView, string> = { active: '/cabinet', done: '/cabinet/closed', profile: '/cabinet/profile' };

export function Cabinet({ view, onNew }: { view: CabView; onNew: () => void }) {
  const nav = useNavigate();
  const [page, setPage] = useState(1);
  const [lastList, setLastList] = useState<'active' | 'done'>(view === 'done' ? 'done' : 'active');
  useEffect(() => {
    setPage(1);
    if (view !== 'profile') setLastList(view);
  }, [view]);
  const state = view === 'profile' ? 'active' : view;
  const size = state === 'done' ? PAGE_SIZE : 50;
  const q = useQuery({
    queryKey: ['apps', state, page],
    queryFn: () => api<Found>('POST', `/client/application/find/${page}/${size}`, { Filter: { State: state } }),
  });
  const go = (v: CabView) => nav(PATHS[v]);
  const onCompare = (a: App) => nav(`/cabinet/compare/${a.ID}/${a.UID}`);
  const counts = q.data?.Counts;

  return (
    <section className="cabinet">
      <div className="wrap cab-layout">
        <aside className="cab-side">
          <nav className="cab-nav cab-nav-top">
            <button type="button" className={view !== 'profile' ? 'on' : ''} onClick={() => go(view === 'profile' ? lastList : view)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                <path d="M14 3v6h6M9 13h6M9 17h4" />
              </svg>
              {t('განაცხადები')}
            </button>
            <button type="button" className={view === 'profile' ? 'on' : ''} onClick={() => go('profile')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21a8 8 0 0 1 16 0" />
              </svg>
              {t('პროფილი')}
            </button>
          </nav>
          {view !== 'profile' && (
            <nav className="cab-nav cab-nav-sub">
              <label className="cab-radio">
                <input type="radio" name="cabv" checked={view === 'active'} onChange={() => go('active')} />
                <i />
                {t('მიმდინარე')} <span className="rc">{counts ? `(${counts.Active})` : ''}</span>
              </label>
              <label className="cab-radio">
                <input type="radio" name="cabv" checked={view === 'done'} onChange={() => go('done')} />
                <i />
                {t('დასრულებული')} <span className="rc">{counts ? `(${counts.Done})` : ''}</span>
              </label>
              <button type="button" className="btn btn-green cab-new-btn" id="cabNew" title={t('ახალი განაცხადი')} aria-label={t('ახალი განაცხადი')} onClick={onNew}>
                <span aria-hidden="true">+</span>
                <span className="txt">{t('ახალი განაცხადი')}</span>
              </button>
            </nav>
          )}
        </aside>
        <div className="cab-main">
          {view === 'profile' ? (
            <Profile />
          ) : (
            <div className="cab-panel cab-list">
              <div className="cab-top">
                <h2 className="cab-title">{t(view === 'done' ? 'დასრულებული განაცხადები' : 'მიმდინარე განაცხადები')}</h2>
                <span className="cab-count">
                  <b>{q.data?.TotalCount ?? 0}</b>
                </span>
              </div>
              <div className="cab-cards">
                {q.data?.Items.map((a) => <AppCard key={a.ID} a={a} expanded={view === 'active'} onCompare={() => onCompare(a)} />)}
                {q.data && !q.data.Items.length && <div className="cab-group-empty">{t(counts && counts.Active + counts.Done === 0 ? 'განაცხადები ჯერ არ გაგიგზავნია' : 'ჯერ არ არის')}</div>}
                {q.isLoading && <div className="cab-group-empty">{t('იტვირთება…')}</div>}
              </div>
              {(q.data?.TotalPages ?? 1) > 1 && <Pager page={page} pages={q.data!.TotalPages} onPage={setPage} />}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  const chev = (d: number) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d={d < 0 ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'} />
    </svg>
  );
  return (
    <nav className="pager" aria-label={t('გვერდები')}>
      <button type="button" className="pg arrow" disabled={page === 1} onClick={() => onPage(page - 1)}>
        {chev(-1)}
      </button>
      {Array.from({ length: pages }, (_, i) => i + 1).map((i) => (
        <button key={i} type="button" className={`pg${i === page ? ' on' : ''}`} disabled={i === page} onClick={() => onPage(i)}>
          {i}
        </button>
      ))}
      <button type="button" className="pg arrow" disabled={page === pages} onClick={() => onPage(page + 1)}>
        {chev(1)}
      </button>
    </nav>
  );
}

const I = {
  eye: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  x: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M15 9l-6 6M9 9l6 6" />
    </svg>
  ),
  compare: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 7.2A2.2 2.2 0 0 1 7.2 5h1a2.2 2.2 0 0 0 1.55-.64l.7-.7a2.2 2.2 0 0 1 3.12 0l.7.7c.42.41.97.64 1.55.64h1a2.2 2.2 0 0 1 2.2 2.2v1c0 .58.23 1.13.64 1.55l.7.7a2.2 2.2 0 0 1 0 3.12l-.7.7a2.2 2.2 0 0 0-.64 1.55v1a2.2 2.2 0 0 1-2.2 2.2h-1a2.2 2.2 0 0 0-1.55.64l-.7.7a2.2 2.2 0 0 1-3.12 0l-.7-.7a2.2 2.2 0 0 0-1.55-.64h-1a2.2 2.2 0 0 1-2.2-2.2v-1a2.2 2.2 0 0 0-.64-1.55l-.7-.7a2.2 2.2 0 0 1 0-3.12l.7-.7A2.2 2.2 0 0 0 5 8.2z" />
      <path d="M9 15l6-6" />
      <circle cx="9.5" cy="9.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="14.5" cy="14.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  ),
};

function Countdown({ o }: { o: AppOrg }) {
  const now = useNow();
  if (!o.ExpiresOn || !['sent', 'offer'].includes(o.Status)) return null;
  const left = new Date(o.ExpiresOn).getTime() - now;
  return (
    <span className={`cd${left <= 0 ? ' over' : ''}`} title={t('პასუხისთვის დარჩენილი დრო')}>
      {fmtCd(left)}
    </span>
  );
}

function AppCard({ a, expanded, onCompare }: { a: App; expanded: boolean; onCompare: () => void }) {
  const qc = useQueryClient();
  const s = useStatus();
  const { cities, districts } = useRefs();
  const [open, setOpen] = useState(expanded);
  const [closed, setClosed] = useState<Set<string>>(new Set(GROUP_ORDER.filter((k) => !OPEN_GROUPS.includes(k))));
  const [view, setView] = useState(false);
  const [offer, setOffer] = useState<AppOrg | null>(null);
  const [cancel, setCancel] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ['apps'] });
  const isClosed = a.Orgs.every((o) => !o.Next.length);
  // closed without any offer accepted (nothing completed) — the application is cancelled
  const isCancelled = isClosed && !a.Orgs.some((o) => s.categoryOf(o.Status) === 'complete');
  // offers waiting for the customer's answer are answered in the comparison (choose / cancel, then send)
  const answerable = a.Orgs.filter((o) => s.acceptOf(o) && o.Offers.length);
  const declineOrg = async (o: AppOrg) => {
    const to = s.cancelOf(o);
    if (!to) return;
    try {
      await changeOrg(o, to);
    } finally {
      refresh();
    }
  };

  return (
    <article className={`cab-card${open ? ' open' : ''}`}>
      <div className="cab-top-row">
        <button type="button" className="cab-sum" aria-expanded={open} onClick={() => setOpen(!open)}>
          <span className="ico">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
              <path d="M14 3v6h6M9 13h6M9 17h4" />
            </svg>
          </span>
          <span className="info">
            <b>{n(a.ProductType)}</b>
            <span className="who">
              {/* personal number before the name (as in the partner cabinet) */}
              {a.Pid ? `${a.Pid} · ` : ''}
              {a.FirstName} {a.LastName}
            </span>
            <small className="when">
              {[n(cities.find((c) => c.ID === a.CityID)), n(districts.find((d) => d.ID === a.DistrictID)) || a.Village].filter(Boolean).join(', ') || '—'} · {fmtDate(a.CreatedOn)}
            </small>
          </span>
          <span className="right">
            <i className="amt">{money(a.Amount, a.Currency)}</i>
            {isCancelled && <em className="app-cancelled">{t('გაუქმებული')}</em>}
          </span>
        </button>
        <div className="cab-acts">
          <button type="button" className="cab-ico cab-view" aria-label={t('ნახვა')} title={t('ნახვა')} onClick={() => setView(true)}>
            {I.eye}
          </button>
          {!isClosed && (
            <button type="button" className="cab-ico cab-cancel danger" aria-label={t('განაცხადის დასრულება')} title={t('განაცხადის დასრულება')} onClick={() => setCancel(true)}>
              {I.x}
            </button>
          )}
        </div>
      </div>
      <button type="button" className="cab-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Chevron />
      </button>
      {open && (
        <div className="cab-det">
          {GROUP_ORDER.map((st) => {
            const list = a.Orgs.filter((o) => o.Status === st);
            if (!list.length) return null;
            const isOpen = !closed.has(st);
            const toggle = () => {
              const n = new Set(closed);
              if (isOpen) n.add(st);
              else n.delete(st);
              setClosed(n);
            };
            return (
              <div key={st} className={`cab-stat${isOpen ? '' : ' closed'}`}>
                <div className="cab-det-group" role="button" tabIndex={0} aria-expanded={isOpen} onClick={toggle} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), toggle())}>
                  <em className={`status ${stCls(st)}`}>{s.label(st)}</em>
                  <span className="grp-right">
                    {/* the offers that came in — side by side */}
                    {st === 'offer' && (
                      <button type="button" className="grp-compare" onClick={(e) => (e.stopPropagation(), onCompare())} onKeyDown={(e) => e.stopPropagation()}>
                        {I.compare}
                        <span>{t('შედარება')}</span>
                      </button>
                    )}
                    <span className="cnt">{list.length}</span>
                    <span className="chev">
                      <Chevron />
                    </span>
                  </span>
                </div>
                {isOpen && (
                  <div className="cab-stat-list">
                    {list.map((o) => {
                      const can = answerable.includes(o);
                      return (
                      <div key={o.ID} className="cab-det-row">
                        <OrgLogo org={o.Organization} />
                        <span className="nm-wrap">
                          <span className="nm">{n(o.Organization)}</span>
                          {/* its offer(s) — on the right of the row */}
                          {o.Offers.length > 0 && (
                            <span className="of-terms">
                              {o.Offers.map((of) => (
                                <span key={of.ID} className={of.ChosenOn ? 'chosen' : undefined} title={of.ChosenOn ? t('არჩეული') : undefined}>
                                  {money(of.Amount, of.Currency)} · {t(`${of.Months} თვე`)} · {of.Rate}%
                                </span>
                              ))}
                            </span>
                          )}
                        </span>
                        <div className="cab-acts">
                          <Countdown o={o} />
                          <button type="button" className="cab-ico o-ico" title={t('ნახვა')} aria-label={t('ნახვა')} onClick={() => setOffer(o)}>
                            {I.eye}
                          </button>
                          {!can && s.cancelOf(o) && (
                            <button type="button" className="cab-ico o-ico danger" title={t('გაუქმება')} aria-label={t('გაუქმება')} onClick={() => declineOrg(o)}>
                              {I.x}
                            </button>
                          )}
                        </div>
                      </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {view && <ViewModal a={a} onClose={() => setView(false)} />}
      {offer && <OfferModal o={offer} onClose={() => setOffer(null)} />}
      {cancel && (
        <CancelModal
          a={a}
          onClose={() => setCancel(false)}
          onDone={() => {
            setCancel(false);
            refresh();
          }}
        />
      )}
    </article>
  );
}

function CancelModal({ a, onClose, onDone }: { a: App; onClose: () => void; onDone: () => void }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal onClose={onClose} noClose labelledBy="cancelTitle">
      <h3 id="cancelTitle">{t('დავასრულოთ განაცხადი?')}</h3>
      <p>
        {n(a.ProductType)} · {money(a.Amount, a.Currency)}
      </p>
      <p>{t('ორგანიზაციები შეთავაზებებს აღარ გამოგიგზავნიან. ამ მოქმედების გაუქმება ვერ მოხერხდება.')}</p>
      <div className="cancel-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          {t('არა')}
        </button>
        <button
          type="button"
          className="btn btn-danger"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api('PUT', `/client/application/cancel/${a.ID}/${a.UID}`);
              onDone();
            } catch (e) {
              setError(errText(e));
              setBusy(false);
            }
          }}
        >
          {t('დიახ, დავასრულო')}
        </button>
      </div>
      <ErrorText error={error} />
    </Modal>
  );
}

/** Application as sent — read only (prototype viewModal). */
function ViewModal({ a, onClose }: { a: App; onClose: () => void }) {
  const { cities, districts, creditHistory, sectors, incomeSources, organizations } = useRefs();
  const s = useStatus();
  const total = (a.Incomes ?? []).reduce((t, i) => t + (+i.Amount || 0), 0);
  const sec = (title: string, rows: [string, string, string?][]) => (
    <div className="view-sec">
      <h4>{up(t(title))}</h4>
      {rows.map(([k, v, cls], i) => (
        <div key={i} className="view-row">
          <span>{t(k)}</span>
          <b>{cls ? <em className={`status ${cls}`}>{v}</em> : v || '—'}</b>
        </div>
      ))}
    </div>
  );
  return (
    <Modal onClose={onClose} className="view-box" labelledBy="viewTitle">
      <h3 id="viewTitle">
        {n(a.ProductType)} · {money(a.Amount, a.Currency)}
      </h3>
      <p>{t('გაგზავნილია')} {fmtDate(a.CreatedOn)}</p>
      <div className="view-body">
        {sec('საკრედიტო ისტორია', [['სტატუსი', refName(creditHistory, a.CreditHistory)]])}
        {sec('ფინანსური მდგომარეობა', [
          ['საქმიანობის სფერო', refName(sectors, a.Sector)],
          ...(a.Incomes ?? []).map((i): [string, string] => [refName(incomeSources, i.Src), `${fmt(i.Amount)} ₾`]),
          ['ჯამური თვიური შემოსავალი', `${fmt(total)} ₾`],
          ['ბანკის სერვისები', (a.Banks ?? []).map((b) => refName(organizations, b)).join(', ')],
        ])}
        {sec('ორგანიზაციები', a.Orgs.map((o): [string, string, string] => [n(o.Organization), s.label(o.Status), stCls(o.Status)]))}
        {sec('პირადი მონაცემები', [
          ['პირადი ნომერი', a.Pid],
          ['სახელი, გვარი', `${a.FirstName} ${a.LastName}`],
          ['დაბადების თარიღი', fmtDay(a.BirthDate)],
          ['ქალაქი', n(cities.find((c) => c.ID === a.CityID))],
          ['უბანი / სოფელი', n(districts.find((d) => d.ID === a.DistrictID)) || a.Village || ''],
          ['მობილური ნომერი', a.Phone ? fmtPhone(a.Phone) : ''],
        ])}
      </div>
    </Modal>
  );
}

/** One organisation's answer: offer terms, accept / decline (prototype offerModal). */
type CmpX = { of: OfferRow; c: NonNullable<ReturnType<typeof calcOffer>> };
const cmpMoney = (v: number, x: CmpX) => money(v, x.of.Currency);
/** Rows of the comparison table: label, value, format, mark the lowest, row class (as on the comparison page). */
const CMP_ROWS: [string, (x: CmpX) => number, (v: number, x: CmpX) => string, boolean, string?][] = [
  ['თანხა', (x) => x.of.Amount, cmpMoney, false],
  ['ვადა', (x) => x.of.Months, (v) => t(`${v} თვე`), false],
  ['წლიური განაკვეთი', (x) => x.of.Rate, (v) => `${v}%`, true],
  ['ეფექტური პროცენტი', (x) => x.c.eff, (v) => `${v}%`, true],
  ['ერთჯერადი საკომისიოები', (x) => x.of.Fee, cmpMoney, true],
  ['ყოველთვიური გადასახადი', (x) => x.c.monthly, cmpMoney, true],
  ['სულ გადასახდელი პროცენტი', (x) => x.c.interest, cmpMoney, true],
  ['სულ გადასახდელი დაზღვევა', (x) => x.c.insTotal, cmpMoney, true],
  ['სულ ძირის გარდა გადასახდელი', (x) => x.c.costTotal, cmpMoney, true],
  ['სულ გადასახდელი', (x) => x.c.total, cmpMoney, true, 'total'],
];

/** One organisation's offer(s): one — label / value; several — the comparison table. */
export function OfferModal({ o, onClose }: { o: AppOrg; onClose: () => void }) {
  const s = useStatus();
  const offers = o.Offers.map((of) => ({ of, c: calcOffer({ amount: of.Amount, months: of.Months, rate: of.Rate, fee: of.Fee, insMonth: of.InsMonth }) })).filter(
    (x): x is { of: OfferRow; c: NonNullable<ReturnType<typeof calcOffer>> } => !!x.c,
  );
  const many = offers.length > 1;
  const any = offers.length > 0;
  // an offer's status: the organisation's; an accepted organisation's offer that was not chosen — "not chosen"
  const notChosen = (x: { of: OfferRow }) => ['accepted', 'done'].includes(o.Status) && !x.of.ChosenOn;
  const offerSt = (x: { of: OfferRow }) => (notChosen(x) ? 'cancelled' : stCls(o.Status));
  const offerLabel = (x: { of: OfferRow }) => (notChosen(x) ? t('არ არის არჩეული') : s.label(o.Status));
  return (
    <Modal onClose={onClose} className={`view-box${many ? ' offer-two' : ''}`} labelledBy="offerOrg" id="offerModal">
      <h3 className="offer-name" id="offerOrg">
        <OrgLogo org={o.Organization} />
        {n(o.Organization)}
      </h3>
      <div className="view-body" id="offerBody">
        {/* the comparison table (same rows, the best value marked) — one offer: one column */}
        {any && (
          <div className="cmp-wrap">
            <table className="cmp" style={{ minWidth: 252 + offers.length * 160 }}>
              <thead>
                <tr>
                  <th />
                  {offers.map((x, i) => (
                    <th key={x.of.ID}>
                      {/* the offer's number in a frame, coloured by its status */}
                      <OfferNum o={o} of={x.of} i={i} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* status of every offer: the organisation's status; one of an accepted organisation's offers not chosen — said so */}
                <tr className="r-st">
                  <td>{t('სტატუსი')}</td>
                  {offers.map((x) => (
                    <td key={x.of.ID}>
                      <em className={`status ${offerSt(x)}`}>{offerLabel(x)}</em>
                    </td>
                  ))}
                </tr>
                {CMP_ROWS.map(([label, val, f, best, cls]) => {
                  const vals = offers.map(val);
                  const min = Math.min(...vals);
                  const mark = best && vals.filter((v) => v === min).length < vals.length;
                  return (
                    <tr key={label} className={cls}>
                      <td>{t(label)}</td>
                      {vals.map((v, i) => (
                        <td key={offers[i].of.ID} className={mark && v === min ? 'best' : undefined}>
                          {f(v, offers[i])}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!o.Offers.length && <p style={{ textAlign: 'center' }}>{t('შეთავაზება ჯერ არ არის — გაგზავნილია')} {fmtDate(o.SentOn)}</p>}
      </div>
    </Modal>
  );
}

// ── the customer's answers to offers: each waiting offer is marked "choose" or "cancel" (or left), sent together

/** Choices of one application's offers (by offer — an organisation may have sent several) and sending them (PUT /client/application/respond). */
export function useOfferMarks(a: App, onSent: () => void) {
  const s = useStatus();
  const answerable = a.Orgs.filter((o) => s.acceptOf(o) && o.Offers.length);
  // organisations still working on it (no offer yet) — finishing the comparison cancels them too
  const pending = a.Orgs.filter((o) => !o.Offers.length && s.cancelOf(o));
  const [marks, setMarks] = useState<Set<number>>(new Set());
  const [asking, setAsking] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  /** choose / unchoose one offer */
  const mark = (offerId: number) =>
    setMarks((x) => {
      const n = new Set(x);
      if (n.has(offerId)) n.delete(offerId);
      else n.add(offerId);
      return n;
    });
  const chosenOffers = answerable.flatMap((o) => o.Offers.filter((of) => marks.has(of.ID)));
  // an organisation goes ahead when one of its offers is chosen; finishing the comparison cancels every other waiting one
  const accepts = answerable.filter((o) => o.Offers.some((of) => marks.has(of.ID)));
  const declines = answerable.filter((o) => !o.Offers.some((of) => marks.has(of.ID)));
  const send = async () => {
    setSending(true);
    setError('');
    try {
      await api('PUT', `/client/application/respond/${a.ID}/${a.UID}`, { OfferIDs: chosenOffers.map((of) => of.ID), DeclineIDs: [...declines, ...pending].map((o) => o.ID) });
      setMarks(new Set());
      setAsking(false);
      onSent();
    } catch (e) {
      setError(errText(e));
    } finally {
      setSending(false);
    }
  };
  return { answerable, pending, marks, mark, chosenOffers, accepts, declines, asking, setAsking, sending, error, setError, send };
}
export type OfferMarks = ReturnType<typeof useOfferMarks>;

/** ✓ choose one offer (icon; the word is in the tooltip) — the ones left unchosen are cancelled on "finish". */
export function MarkButtons({ o, of, m }: { o: AppOrg; of: OfferRow; m: OfferMarks }) {
  const on = m.marks.has(of.ID);
  return (
    <span className="marks" role="group" aria-label={n(o.Organization)}>
      <button type="button" className={`mark ok${on ? ' on' : ''}`} aria-pressed={on} title={t('არჩევა')} aria-label={t('არჩევა')} onClick={() => m.mark(of.ID)}>
        <svg viewBox="0 0 24 24"><path d="M5 12l4 4 10-10" /></svg>
      </button>
    </span>
  );
}

/** Counts and "send" (with a summary first). */
export function MarkBar({ m }: { m: OfferMarks }) {
  // nothing chosen is an answer too — then every offer (and every organisation still without one) is cancelled
  const canSend = !m.sending;
  return (
    <div className="pick-bar">
      <span className="pick-acts">
        <span className={`pick-n${m.chosenOffers.length ? ' on' : ''}`}>
          {t('არჩეულია')}: <b>{m.chosenOffers.length}</b>
        </span>
        <button type="button" className="btn btn-green sm" disabled={!canSend} onClick={() => (m.setError(''), m.setAsking(true))}>
          {t('შედარების დასრულება')}
        </button>
      </span>
      {m.asking && <ConfirmOffers accept={m.accepts} chosen={m.marks} cancel={m.declines} pending={m.pending} busy={m.sending} error={m.error} onYes={m.send} onClose={() => m.setAsking(false)} />}
    </div>
  );
}

/** Before answering: which offers will be accepted and which cancelled (it cannot be undone). */
export function ConfirmOffers({ accept, chosen, cancel, pending = [], busy, error, onYes, onClose }: { accept: AppOrg[]; chosen?: Set<number>; cancel: AppOrg[]; pending?: AppOrg[]; busy: boolean; error: string; onYes: () => void; onClose: () => void }) {
  // each group folds: the heading with its count, the organisations inside; "will be accepted" starts open
  // the cancel groups show even with 0; an empty group doesn't open
  const group = (kind: 'ok' | 'no', title: string, l: AppOrg[], always = false) =>
    (l.length > 0 || always) && (
      <details className={`cf-group ${kind}${l.length ? '' : ' empty'}`} open={kind === 'ok' && l.length > 0} onToggle={(e) => !l.length && (e.currentTarget.open = false)}>
        <summary>
          <b>{t(title)}</b>
          <span className="cnt">{l.length}</span>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </summary>
        <ul>
          {l.map((o) => (
            <li key={o.ID}>
              <OrgLogo org={o.Organization} />
              <span className="nm">{n(o.Organization)}</span>
              {/* the offer's terms (one per offer; going ahead — only the chosen ones); an organisation without an offer — none */}
              {o.Offers.filter((of) => kind === 'no' || !chosen || chosen.has(of.ID)).map((of) => (
                <span key={of.ID} className="terms">
                  {o.Offers.length > 1 && <OfferNum o={o} of={of} i={o.Offers.indexOf(of)} />}
                  {money(of.Amount, of.Currency)} · {t(`${of.Months} თვე`)} · {of.Rate}%
                </span>
              ))}
            </li>
          ))}
        </ul>
      </details>
    );
  return (
    <Modal onClose={onClose} labelledBy="confirmOffersTitle" className="modal-confirm-offers">
      <h3 id="confirmOffersTitle">{t('პასუხის გაგზავნა')}</h3>
      <div className="cf-groups">
        {group('ok', 'დადასტურდება', accept)}
        {group('no', 'გაუქმდება - შეთავაზება', cancel, true)}
        {group('no', 'გაუქმდება - შეთავაზება მიუღებელი', pending, true)}
      </div>
      <div className="cancel-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          {t('დახურვა')}
        </button>
        <button type="button" className="btn btn-green" disabled={busy} onClick={onYes}>
          {t('გაგზავნა')}
        </button>
      </div>
      <ErrorText error={error} />
    </Modal>
  );
}

// ── profile

interface ProfileData {
  ID: number;
  UID: string;
  User: { Email: string | null; Phone: string | null; UserName: string | null; IsVerified: boolean };
  Customer: { Pid: string | null; FirstName: string | null; LastName: string | null; BirthDate: string | null; CityID: number | null; DistrictID: number | null; Village: string | null } | null;
}
type Field = 'user' | 'phone' | 'loc' | 'pid' | 'first' | 'last' | 'dob';
const TITLES: Record<Field, string> = {
  user: 'მომხმარებლის სახელის შეცვლა', phone: 'მობილურის შეცვლა', loc: 'ლოკაციის შეცვლა', pid: 'პირადი ნომრის შეცვლა',
  first: 'სახელის შეცვლა', last: 'გვარის შეცვლა', dob: 'დაბადების თარიღის შეცვლა',
};

function Profile() {
  const { me, refresh } = useSession();
  const { cities, districts } = useRefs();
  const qc = useQueryClient();
  const p = me?.Profile;
  const q = useQuery({ queryKey: ['profile', p?.ID], queryFn: () => api<ProfileData>('GET', `/client/profile/detail/${p!.ID}/${p!.UID}`), enabled: !!p });
  const [edit, setEdit] = useState<Field | null>(null);
  const d = q.data;
  if (!d) return <div className="cab-group-empty">{t('იტვირთება…')}</div>;
  const c = d.Customer;
  const loc = [n(cities.find((x) => x.ID === c?.CityID)), n(districts.find((x) => x.ID === c?.DistrictID)) || c?.Village].filter(Boolean).join(', ');
  const btn = (f: Field) => (
    <button type="button" className="btn btn-green prof-edit" onClick={() => setEdit(f)}>
      {t('შეცვლა')}
    </button>
  );
  const saved = async () => {
    setEdit(null);
    await qc.invalidateQueries({ queryKey: ['profile'] });
    await refresh();
  };
  return (
    <div>
      <div className="cab-panel prof-sec">
        <h3 className="prof-h">{t('მომხმარებელი')}</h3>
        <div className="prof-info">
          <div className="prof-row">
            <span>{t('ელ. ფოსტა')}</span>
            <b>{d.User.Email ?? '—'}</b>
            <i />
          </div>
          <div className="prof-row">
            <span>{t('მომხმარებლის სახელი')}</span>
            <b>{d.User.UserName || d.User.Email?.split('@')[0] || '—'}</b>
            {btn('user')}
          </div>
          <div className="prof-row">
            <span>{t('მობილური')}</span>
            <b>{d.User.Phone ? fmtPhone(d.User.Phone) : '—'}</b>
            {btn('phone')}
          </div>
          <div className="prof-row">
            <span>{t('ლოკაცია')}</span>
            <b>{loc || '—'}</b>
            {btn('loc')}
          </div>
        </div>
      </div>
      <div className="cab-panel prof-sec">
        <h3 className="prof-h">{t('პირადი მონაცემები')}</h3>
        <div className="prof-info prof-info-2">
          <div className="prof-row prof-row-3">
            <span>{t('ვერიფიცირებული')}</span>
            <b className={`verify ${d.User.IsVerified ? 'yes' : 'no'}`}>{t(d.User.IsVerified ? 'კი' : 'არა')}</b>
            <i />
          </div>
          <div className="prof-row prof-row-3">
            <span>{t('პირადი ნომერი')}</span>
            <b>{c?.Pid || '—'}</b>
            {btn('pid')}
          </div>
          <div className="prof-row prof-row-3">
            <span>{t('სახელი')}</span>
            <b>{c?.FirstName || '—'}</b>
            {btn('first')}
          </div>
          <div className="prof-row prof-row-3">
            <span>{t('გვარი')}</span>
            <b>{c?.LastName || '—'}</b>
            {btn('last')}
          </div>
          <div className="prof-row prof-row-3">
            <span>{t('დაბადების თარიღი')}</span>
            <b>{fmtDay(c?.BirthDate)}</b>
            {btn('dob')}
          </div>
        </div>
      </div>
      {edit && <ChangeModal field={edit} d={d} onClose={() => setEdit(null)} onSaved={saved} />}
    </div>
  );
}

/** Change one profile value (prototype changeModal); a new mobile is confirmed with an SMS code. */
function ChangeModal({ field, d, onClose, onSaved }: { field: Field; d: ProfileData; onClose: () => void; onSaved: () => void }) {
  const { cities, districts } = useRefs();
  const c = d.Customer;
  const [text, setText] = useState(
    field === 'user' ? d.User.UserName ?? d.User.Email?.split('@')[0] ?? '' : field === 'pid' ? c?.Pid ?? '' : field === 'first' ? c?.FirstName ?? '' : field === 'last' ? c?.LastName ?? '' : field === 'dob' ? c?.BirthDate?.slice(0, 10) ?? '' : '',
  );
  const [city, setCity] = useState(c?.CityID ? String(c.CityID) : '');
  const [district, setDistrict] = useState(c?.DistrictID ? String(c.DistrictID) : '');
  const [village, setVillage] = useState(c?.Village ?? '');
  const [otp, setOtp] = useState(false);
  const [error, setError] = useState('');
  const cityDistricts = districts.filter((x) => String(x.CityID) === city);
  const ok =
    field === 'phone' ? /^5\d{8}$/.test(text)
    : field === 'pid' ? /^\d{11}$/.test(text)
    : field === 'loc' ? !!city
    : !!text.trim();

  const save = async () => {
    if (field === 'phone') return setOtp(true);
    // the profile is saved as a whole: current values + the changed one
    const body = {
      UserName: d.User.UserName, Pid: c?.Pid ?? null, FirstName: c?.FirstName ?? null, LastName: c?.LastName ?? null, BirthDate: c?.BirthDate?.slice(0, 10) ?? null,
      CityID: c?.CityID ?? null, DistrictID: c?.DistrictID ?? null, Village: c?.Village ?? null,
      ...(field === 'user' ? { UserName: text.trim() } : {}),
      ...(field === 'pid' ? { Pid: text } : {}),
      ...(field === 'first' ? { FirstName: text.trim() } : {}),
      ...(field === 'last' ? { LastName: text.trim() } : {}),
      ...(field === 'dob' ? { BirthDate: text } : {}),
      ...(field === 'loc' ? { CityID: Number(city), DistrictID: district ? Number(district) : null, Village: cityDistricts.length ? null : village.trim() || null } : {}),
    };
    try {
      await api('PUT', `/client/profile/edit/${d.ID}/${d.UID}`, body);
      onSaved();
    } catch (e) {
      setError(errText(e));
    }
  };

  if (otp)
    return (
      <OtpModal
        where="კოდი გაიგზავნა ნომერზე"
        target={fmtPhone(text)}
        send={() => api<Ref>('POST', '/client/profile/sendPhoneOtp', { Phone: text })}
        verify={async (ref, code) => {
          await api('PUT', `/client/profile/changePhone/${d.ID}/${d.UID}`, { Phone: text, Otp: { ID: ref.ID, UID: ref.UID, Code: code } });
          onSaved();
        }}
        onClose={onClose}
      />
    );
  return (
    <Modal onClose={onClose} labelledBy="changeTitle">
      <h3 id="changeTitle">{t(TITLES[field])}</h3>
      {field === 'phone' && <p>{t('ახალ ნომერზე SMS-ით ერთჯერადი კოდი გაიგზავნება')}</p>}
      {field === 'phone' ? (
        <div className="phone login-phone">
          <span>+995</span>
          <input type="tel" inputMode="numeric" maxLength={9} placeholder="5XX XXX XXX" aria-label={t('ახალი მობილური ნომერი')} value={text} onChange={(e) => setText(e.target.value.replace(/\D/g, '').slice(0, 9))} autoFocus />
        </div>
      ) : field === 'loc' ? (
        <div className="f-grid loc-grid">
          <div className="f">
            <label htmlFor="chCity">{t('ქალაქი')}</label>
            <select id="chCity" value={city} onChange={(e) => (setCity(e.target.value), setDistrict(''), setVillage(''))}>
              <option value="" disabled>
                {t('აირჩიეთ')}
              </option>
              {cities.map((x) => (
                <option key={x.ID} value={x.ID}>
                  {n(x)}
                </option>
              ))}
            </select>
          </div>
          {cityDistricts.length > 0 ? (
            <div className="f">
              <label htmlFor="chDistrict">{t('უბანი')}</label>
              <select id="chDistrict" value={district} onChange={(e) => setDistrict(e.target.value)}>
                <option value="">{t('აირჩიეთ')}</option>
                {cityDistricts.map((x) => (
                  <option key={x.ID} value={x.ID}>
                    {n(x)}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="f">
              <label htmlFor="chVillage">{t('უბანი / სოფელი')}</label>
              <input id="chVillage" value={village} disabled={!city} onChange={(e) => setVillage(e.target.value)} />
            </div>
          )}
        </div>
      ) : (
        <input
          className="login-email"
          type={field === 'dob' ? 'date' : 'text'}
          min={field === 'dob' ? '1930-01-01' : undefined}
          max={field === 'dob' ? '2010-12-31' : undefined}
          inputMode={field === 'pid' ? 'numeric' : 'text'}
          maxLength={field === 'pid' ? 11 : 60}
          placeholder={field === 'pid' ? t('11 ციფრი') : ''}
          value={text}
          onChange={(e) => setText(field === 'pid' ? e.target.value.replace(/\D/g, '').slice(0, 11) : e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && ok && save()}
          autoFocus
        />
      )}
      <button type="button" className="btn btn-green full" disabled={!ok} onClick={save}>
        {t(field === 'phone' ? 'გაგრძელება' : 'შენახვა')}
      </button>
      <ErrorText error={error} />
    </Modal>
  );
}
