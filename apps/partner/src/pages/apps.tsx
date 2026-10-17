import { calcOffer } from '@loans/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams } from 'react-router-dom';
import { api, ApiError, crud, findAll, Page, Ref } from '../api';
import { Named, StatusRow, statusColor, useRefs, useSession } from '../session';
import { Chevron, curSym, ErrorLine, fmt, fmtCd, fmtDate, Modal, useNow, useToast } from '../ui/ui';

// Incoming applications (prototype partner.html render / renderDetail / actions / forms).
// Data: POST /partner/application/find, GET …/detail (with the allowed next statuses), PUT …/changeStatus.

interface Application {
  ID: number;
  ProductTypeID: number;
  ProductType: { ID: number; NameKa: string };
  Amount: number;
  Currency: string;
  Pid: string | null;
  FirstName: string;
  LastName: string;
  BirthDate: string | null;
  Phone: string | null;
  Email: string | null;
  CityID: number | null;
  DistrictID: number | null;
  Village: string | null;
  CreditHistory: string | null;
  Sector: string | null;
  Incomes: { Src: string; Amount: number }[] | null;
  Banks: ({ Name: string; Services?: string[] } | string)[] | null;
  CreatedOn: string;
}
interface OfferRow {
  ID: number;
  CardID: number | null;
  Amount: number;
  Currency: string;
  Months: number;
  Rate: number;
  Fee: number;
  InsMonth: number;
  CreatedOn: string;
  /** the customer chose this one (several offers — the customer picks) */
  ChosenOn: string | null;
}
interface Rec {
  ID: number;
  UID: string;
  Status: string;
  StatusOn: string;
  ExpiresOn: string | null;
  OfferOn: string | null;
  ReasonIDs: number[];
  ReasonText: string | null;
  IsMasked: boolean;
  /** phone / e-mail not open yet — the review has not started */
  ContactsHidden: boolean;
  /** the staff member who took it (first action); null = free — every sales in scope sees it */
  AssignedTo: { ID: number; DisplayName: string | null } | null;
  Application: Application;
  Offers: OfferRow[];
}
interface Detail extends Rec {
  Events: { ID: number; FromStatus: string | null; ToStatus: string; Actor: string; CreatedOn: string }[];
  Next: { Status: string; Label: string; ReasonKind: 'reject' | 'cancel' | null; RequiresOffer: boolean; RequiresIssued: boolean }[];
}
interface FindResult extends Page<Rec> {
  StatusCounts: { Status: string; Count: number }[];
}
interface Card {
  ID: number;
  UID: string;
  ProductID: number;
  OfferTypeID: number;
  Currency: string;
  IsEnable: boolean;
  Values: Record<string, number | string | boolean | null>;
  Product: { ID: number; ProductTypeID: number };
}

const PAGE = 5;
const TIMES = { '24h': 1, '7d': 7, '30d': 30 } as const;
const TIMER_TITLE: Record<string, string> = {
  sent: 'პასუხისთვის დარჩენილი დრო', interested: 'შეთავაზების გაგზავნისთვის დარჩენილი დრო',
  offer: 'მომხმარებელს დადასტურებისთვის დარჩენილი დრო', accepted: 'სესხის გაცემისთვის დარჩენილი დრო',
};
const ACTOR: Record<string, string> = { customer: 'მომხმარებელი', partner: 'პარტნიორი', system: 'სისტემა', admin: 'ადმინი' };

const applicantName = (r: Rec) => (r.IsMasked ? `განმცხადებელი ${r.Application.LastName}` : `${r.Application.Pid ? r.Application.Pid + ' · ' : ''}${r.Application.FirstName} ${r.Application.LastName}`);
const money = (n: number, cur: string) => `${fmt(n)} ${curSym(cur)}`;

/** Offer terms a card gives for this application — the same rule as the API (amount within the card, term by amount). */
export const cardTerms = (card: Card, amountAsked: number) => {
  const v = card.Values as Record<string, number>;
  const amount = Math.min(Math.max(amountAsked, v.MinAmt ?? 0), v.MaxAmt ?? amountAsked);
  const base = amount <= 3000 ? 12 : amount <= 50000 ? 36 : 120;
  const months = Math.min(Math.max(base, v.MinM ?? 1), v.MaxM ?? 12);
  const fee = Math.round((amount * (v.FeePct ?? 0)) / 100);
  const insMonth = Math.round((amount * (v.InsPct ?? 0)) / 100);
  return { amount, months, rate: v.Rate ?? 0, fee, insMonth, calc: calcOffer({ amount, months, rate: v.Rate ?? 0, fee, insMonth }) };
};

export function AppsPage() {
  const refs = useRefs();
  const qc = useQueryClient();
  // the open record is in the address: /applications/{id} (a link or a notification opens it)
  const { id } = useParams();
  const nav = useNavigate();
  const sel = id ? Number(id) : null;
  const setSel = (x: number | null) => nav(x ? `/applications/${x}` : '/applications', { replace: true });
  const [search, setSearch] = useState('');
  const [city, setCity] = useState('all');
  const [time, setTime] = useState<keyof typeof TIMES | 'all'>('24h');
  const [view, setView] = useState<Set<string> | null>(null);
  const [page, setPage] = useState(1);
  const first = useRef(true);
  const [ddOpen, setDdOpen] = useState(false);
  const ddBtn = useRef<HTMLButtonElement>(null);

  // default view: everything except the cancelled categories
  const cancelKeys = refs.statuses.filter((s) => s.Category === 'canceled').map((s) => s.Key);
  const mainKeys = refs.statuses.filter((s) => s.Category !== 'canceled').map((s) => s.Key);
  const shown = view ?? new Set(mainKeys);

  const filter = useMemo(() => {
    const [t, v] = [city.slice(0, 1), city.slice(2)];
    return {
      ...(search ? { Search: search } : {}),
      Statuses: [...shown],
      ...(time !== 'all' ? { From: new Date(Date.now() - TIMES[time] * 864e5).toISOString() } : {}),
      ...(t === 'c' ? { CityID: Number(v) } : t === 'd' ? { CityID: Number(v.split('|')[0]), DistrictID: Number(v.split('|')[1]) } : {}),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, city, time, [...shown].join()]);
  useEffect(() => {
    // a filter change closes the open record (not on the first render — it may come from the address)
    if (!refs.statuses.length) return; // the default status filter is not known yet
    if (first.current) {
      first.current = false;
      return;
    }
    setPage(1);
    setSel(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(filter)]);

  const q = useQuery({
    queryKey: ['apps', filter, page],
    queryFn: () => api<FindResult>('POST', `/partner/application/find/${page}/${PAGE}`, { Filter: filter }),
    enabled: refs.statuses.length > 0,
  });
  const counts = (k: string) => q.data?.StatusCounts.find((c) => c.Status === k)?.Count ?? 0;
  const st = (k: string) => refs.statuses.find((s) => s.Key === k);
  const toggle = (k: string) => {
    const n = new Set(shown);
    if (n.has(k)) n.delete(k);
    else n.add(k);
    setView(n);
  };
  const selC = cancelKeys.filter((k) => shown.has(k)).length;
  const refresh = () => qc.invalidateQueries({ queryKey: ['apps'] });

  const rows = q.data?.Items ?? [];
  // the record from the address, when it is not on this page / in this filter — shown on top
  const pinned = useQuery({
    queryKey: ['apps', 'one', sel],
    queryFn: () => api<FindResult>('POST', '/partner/application/find/1/1', { Filter: { ID: sel } }).then((p) => p.Items[0] ?? null),
    enabled: !!sel && !!q.data && !rows.some((r) => r.ID === sel),
  });
  const extra = sel && pinned.data && !rows.some((r) => r.ID === sel) ? pinned.data : null;
  const pages = q.data?.TotalPages ?? 1;

  return (
    <div className="main">
      <div className="top">
        <h2>განაცხადები</h2>
        <span className="count">{q.data?.TotalCount ?? 0}</span>
      </div>
      <div className="srow">
        <input className="search" type="search" placeholder="ძებნა: პირადი ნომერი, სახელი გვარი, მობილური" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="fsel" aria-label="ლოკაცია" value={city} onChange={(e) => setCity(e.target.value)}>
          <option value="all">ლოკაცია: ყველა</option>
          {refs.cities.map((c) => {
            const ds = refs.districts.filter((d) => d.CityID === c.ID);
            return ds.length ? (
              <optgroup key={c.ID} label={c.NameKa}>
                <option value={`c:${c.ID}`}>{c.NameKa} — ყველა</option>
                {ds.map((d) => (
                  <option key={d.ID} value={`d:${c.ID}|${d.ID}`}>
                    {d.NameKa}
                  </option>
                ))}
              </optgroup>
            ) : (
              <option key={c.ID} value={`c:${c.ID}`}>
                {c.NameKa}
              </option>
            );
          })}
        </select>
        <select className="fsel" aria-label="დრო" value={time} onChange={(e) => setTime(e.target.value as typeof time)}>
          <option value="24h">ბოლო 24 საათი</option>
          <option value="7d">ბოლო კვირა</option>
          <option value="30d">ბოლო თვე</option>
          <option value="all">ყველა</option>
        </select>
      </div>
      <div className="chips">
        {mainKeys.map((k) => {
          const on = shown.has(k);
          const c = statusColor(st(k), k);
          return (
            <button key={k} type="button" className={`chip${on ? ' on' : ''}`} aria-pressed={on} style={on ? { background: c } : { color: c, borderColor: c }} onClick={() => toggle(k)}>
              {st(k)?.ChipLabel}
              <span className="nr">
                <span className="n">{counts(k)}</span>
              </span>
            </button>
          );
        })}
        <span className="chip-dd">
          <button
            ref={ddBtn}
            type="button"
            className={`chip${selC ? ' on' : ''}`}
            aria-pressed={selC > 0}
            style={selC ? { background: 'var(--grey-status)' } : { color: 'var(--grey-status)', borderColor: 'var(--grey-status)' }}
            onClick={(e) => (e.stopPropagation(), setDdOpen((o) => !o))}
          >
            გაუქმებული{selC && selC < cancelKeys.length ? ` (${selC}/${cancelKeys.length})` : ''}
            <span className="nr">
              <span className="n">{cancelKeys.reduce((t, k) => t + counts(k), 0)}</span>
              <svg className="dd-arrow" viewBox="0 0 24 24">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </span>
          </button>
          {ddOpen && ddBtn.current && <CancelMenu anchor={ddBtn.current} keys={cancelKeys} st={st} counts={counts} shown={shown} toggle={toggle} onClose={() => setDdOpen(false)} />}
        </span>
      </div>
      <div className="list">
        {extra && <AppCard key={`pinned-${extra.ID}`} r={extra} open onToggle={() => setSel(null)} st={st} onChanged={refresh} />}
        {!rows.length ? (
          <div className="empty">{q.isLoading ? 'იტვირთება…' : shown.size ? 'მონიშნულ სტატუსებში განაცხადი არ არის' : 'მონიშნე სტატუსი, რომ განაცხადები გამოჩნდეს'}</div>
        ) : (
          rows.map((r) => <AppCard key={r.ID} r={r} open={sel === r.ID} onToggle={() => setSel(sel === r.ID ? null : r.ID)} st={st} onChanged={refresh} />)
        )}
      </div>
      {pages > 1 && (
        <nav className="pager">
          <button type="button" className="pg" disabled={page === 1} onClick={() => setPage(page - 1)}>
            ‹
          </button>
          {Array.from({ length: pages }, (_, i) => i + 1).map((i) => (
            <button key={i} type="button" className={`pg${i === page ? ' on' : ''}`} disabled={i === page} onClick={() => setPage(i)}>
              {i}
            </button>
          ))}
          <button type="button" className="pg" disabled={page === pages} onClick={() => setPage(page + 1)}>
            ›
          </button>
        </nav>
      )}
    </div>
  );
}

/** Dropdown of the cancelled statuses (one chip for all three) — right under the chip, aligned to its right edge (prototype openCancelDd). */
function CancelMenu({ anchor, keys, st, counts, shown, toggle, onClose }: { anchor: HTMLElement; keys: string[]; st: (k: string) => StatusRow | undefined; counts: (k: string) => number; shown: Set<string>; toggle: (k: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onClose();
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [onClose]);
  const r = anchor.getBoundingClientRect();
  const pos = { top: r.bottom + window.scrollY + 4, left: Math.max(8, r.right + window.scrollX - 280), minWidth: 280 };
  return createPortal(
    <div className="menu dd" ref={ref} style={pos} onClick={(e) => e.stopPropagation()}>
      {keys.map((k) => (
        <label key={k} className={`dd-row${shown.has(k) ? ' on' : ''}`}>
          <input type="checkbox" checked={shown.has(k)} onChange={() => toggle(k)} />
          <i />
          <span style={{ color: statusColor(st(k), k) }}>{st(k)?.PartnerLabel}</span>
          <b>{counts(k)}</b>
        </label>
      ))}
    </div>,
    document.body,
  );
}

function Countdown({ r, s }: { r: Rec; s?: StatusRow }) {
  const now = useNow();
  if (!r.ExpiresOn || s?.Category !== 'progress') return null;
  const left = new Date(r.ExpiresOn).getTime() - now;
  const quiet = r.Status === 'offer'; // the customer's deadline — not a reason to hurry the partner
  return (
    <span className={`cd${quiet ? ' quiet' : ''}${left <= 0 && !quiet ? ' over' : ''}`} title={TIMER_TITLE[r.Status] ?? 'დარჩენილი დრო'}>
      {fmtCd(left)}
    </span>
  );
}

type Act = Detail['Next'][number];

function AppCard({ r, open, onToggle, st, onChanged }: { r: Rec; open: boolean; onToggle: () => void; st: (k: string) => StatusRow | undefined; onChanged: () => void }) {
  const s = st(r.Status);
  const a = r.Application;
  const { cities } = useRefs();
  const { me } = useSession();
  // back office sees everyone's records — with who took them
  const taker = me?.Profile?.Role === 'back' && r.AssignedTo ? (r.AssignedTo.ID === me.Profile.ID ? 'შენ' : r.AssignedTo.DisplayName) : null;
  const detail = useQuery({ queryKey: ['app', r.ID, r.Status], queryFn: () => crud('partner', 'application').detail<Detail>(r), enabled: open });
  const [action, setAction] = useState<Act | null>(null);
  const toast = useToast();

  // the two buttons of the prototype: » next status (in its colour) and ✕ cancel
  const next = detail.data?.Next.find((n) => st(n.Status)?.Category !== 'canceled');
  const cancel = detail.data?.Next.find((n) => st(n.Status)?.Category === 'canceled');
  const run = async (n: Act) => {
    if (n.RequiresOffer || n.RequiresIssued || n.ReasonKind) return setAction(n);
    try {
      await api('PUT', `/partner/application/changeStatus/${r.ID}/${r.UID}`, { Status: n.Status });
      toast(`სტატუსი: ${st(n.Status)?.PartnerLabel}`);
      onChanged();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'შეცდომა');
    }
  };
  const bar = (extra = '') =>
    next || cancel ? (
      <div className={`abar ${extra}`}>
        <span className="racts">
          {next && (
            <button type="button" className="ib act" title={next.Label} style={{ ['--c' as string]: statusColor(st(next.Status), next.Status) }} onClick={() => run(next)}>
              <svg viewBox="0 0 24 24">
                <path d="M6 6l6 6-6 6M13 6l6 6-6 6" />
              </svg>
              <span>{actionLabel(next, st)}</span>
            </button>
          )}
          {cancel && (
            <button type="button" className="ib act" title={cancel.Label} style={{ ['--c' as string]: statusColor(st(cancel.Status), cancel.Status) }} onClick={() => run(cancel)}>
              <svg viewBox="0 0 24 24">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
              <span>გაუქმება</span>
            </button>
          )}
        </span>
      </div>
    ) : null;

  return (
    <div className={`card${open ? ' open' : ''}`}>
      <div className="row r4">
        <span className="ico" style={{ background: statusColor(s, r.Status), color: '#fff' }}>
          <svg viewBox="0 0 24 24">
            <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
            <path d="M14 3v6h6M9 13h6M9 17h4" />
          </svg>
        </span>
        <span className="info">
          <b>{a.ProductType.NameKa}</b>
          <small>
            {applicantName(r)}
            {taker && <span className="taker" title="აიღო"> · 👤 {taker}</span>}
          </small>
          <small>
            {cities.find((c) => c.ID === a.CityID)?.NameKa ?? '—'} · {fmtDate(a.CreatedOn)}
          </small>
        </span>
        <span className="right">
          <span className="amt">{money(a.Amount, a.Currency)}</span>
          <span className="amt-line">
            <Countdown r={r} s={s} />
            <span className="st-text" style={{ color: statusColor(s, r.Status) }}>
              {s?.ChipLabel ?? r.Status}
            </span>
          </span>
        </span>
        <button type="button" className="ib tg" aria-label="ჩამოშლა" aria-expanded={open} onClick={onToggle}>
          <Chevron />
        </button>
      </div>
      {open && bar('top')}
      {open && (
        <div className="det">{detail.data ? <AppDetail d={detail.data} st={st} bottom={bar()} /> : <div className="empty small">იტვირთება…</div>}</div>
      )}
      {action && detail.data && (
        <ActionModal
          d={detail.data}
          act={action}
          st={st}
          onClose={() => setAction(null)}
          onDone={() => {
            setAction(null);
            toast(`სტატუსი: ${st(action.Status)?.PartnerLabel}`);
            onChanged();
          }}
        />
      )}
    </div>
  );
}

const actionLabel = (n: Act, st: (k: string) => StatusRow | undefined) =>
  n.RequiresOffer ? 'შეთავაზების გაგზავნა' : n.RequiresIssued ? 'დასრულება' : n.Status === 'interested' ? 'განხილვა' : st(n.Status)?.PartnerLabel ?? n.Status;

function AppDetail({ d, st, bottom }: { d: Detail; st: (k: string) => StatusRow | undefined; bottom: React.ReactNode }) {
  const a = d.Application;
  const { cities, districts, rejectReasons, cancelReasons } = useRefs();
  const kv = (rows: [string, React.ReactNode][]) => (
    <div className="kv">
      {rows.map(([k, v]) => (
        <span key={k} style={{ display: 'contents' }}>
          <span>{k}</span>
          <b>{v || '—'}</b>
        </span>
      ))}
    </div>
  );
  const sec = (title: string, body: React.ReactNode, date?: string) => (
    <details className="dsec" open>
      <summary>
        <h4>{title}</h4>
        {date && <span className="sdate">{date}</span>}
        <Chevron />
      </summary>
      <div className="dbody">{body}</div>
    </details>
  );
  const place = [cities.find((c) => c.ID === a.CityID)?.NameKa, districts.find((x) => x.ID === a.DistrictID)?.NameKa ?? a.Village].filter(Boolean).join(', ');
  const total = (a.Incomes ?? []).reduce((t, i) => t + (+i.Amount || 0), 0);
  const reasons = [...[...rejectReasons, ...cancelReasons].filter((x) => d.ReasonIDs.includes(x.ID)).map((x) => x.NameKa), ...(d.ReasonText ? [`სხვა: ${d.ReasonText}`] : [])];
  return (
    <>
      <div className="dgrid">
        {d.Offers.length > 0 &&
          sec(
            d.Offers.length > 1 ? 'გაგზავნილი შეთავაზებები' : 'გაგზავნილი შეთავაზება',
            <OffersRO offers={d.Offers} status={d.Status} st={st} />,
            d.OfferOn ? fmtDate(d.OfferOn) : undefined,
          )}
        {['cancelled', 'rejected'].includes(d.Status) &&
          reasons.length > 0 &&
          sec(
            reasons.length > 1 ? 'გაუქმების მიზეზები' : 'გაუქმების მიზეზი',
            <div className="tpl ro">
              {reasons.map((x) => (
                <div key={x}>
                  <b>{x}</b>
                </div>
              ))}
            </div>,
          )}
        {sec(
          'განმცხადებელი',
          d.IsMasked ? (
            <>
              {kv([
                ['განმცხადებელი', a.LastName],
                ['ლოკაცია', place],
                ['სესხის მიზანი', a.ProductType.NameKa],
              ])}
              <div className="lock">პერსონალური მონაცემები (სახელი, პირადი ნომერი, კონტაქტი) გაიხსნება განხილვაში აყვანის შემდეგ.</div>
            </>
          ) : (
            <>
              {kv([
                ['სახელი, გვარი', `${a.FirstName} ${a.LastName}`],
                ['პირადი ნომერი', a.Pid],
                ['დაბადების თარიღი', a.BirthDate ? a.BirthDate.slice(0, 10).split('-').reverse().join('.') : ''],
                ['მობილური', d.ContactsHidden ? '🔒 დამალულია' : a.Phone ? `+995 ${a.Phone}` : ''],
                ['ელ. ფოსტა', d.ContactsHidden ? '🔒 დამალულია' : a.Email],
                ['ლოკაცია', place],
              ])}
              {d.ContactsHidden && <div className="lock">საკონტაქტო ინფორმაცია (მობილური, ელ.ფოსტა) გამოჩნდება განხილვის დაწყებისას.</div>}
            </>
          ),
        )}
        {sec(
          'ფინანსური მდგომარეობა',
          kv([
            ['საკრედიტო ისტორია', a.CreditHistory],
            ['საქმიანობის სფერო', a.Sector],
            ['შემოსავლები', (a.Incomes ?? []).map((i) => `${i.Src}: ${fmt(i.Amount)} ₾`).join(', ')],
            ['ჯამური თვიური', total ? `${fmt(total)} ₾` : ''],
            ['ბანკის სერვისები', (a.Banks ?? []).map((b) => (typeof b === 'string' ? b : b.Name)).join(', ')],
            ['მოთხოვნილი თანხა', money(a.Amount, a.Currency)],
          ]),
        )}
      </div>
      {bottom}
      <div className="hist">
        {d.Events.map((e) => (
          <div key={e.ID} className="lg-e">
            <span className="by">{ACTOR[e.Actor] ?? e.Actor}</span>
            <b>{fmtDate(e.CreatedOn)}</b> — {e.ToStatus === 'sent' ? 'განაცხადი მიღებულია' : st(e.ToStatus)?.PartnerLabel ?? e.ToStatus}
          </div>
        ))}
      </div>
    </>
  );
}

/** Several offers: each one's number in a filled frame, coloured by its status (the record's; an accepted record's offer
 *  the customer did not choose — grey). */
const OfferNum = ({ i, status, chosen, st }: { i: number; status: string; chosen: boolean; st: (k: string) => StatusRow | undefined }) => {
  const notChosen = ['accepted', 'done'].includes(status) && !chosen;
  return (
    <span className="of-num" style={{ background: notChosen ? 'var(--grey-status)' : statusColor(st(status), status) }} title={notChosen ? 'მომხმარებელმა არ აირჩია' : st(status)?.PartnerLabel}>
      {i + 1}
    </span>
  );
};

const OffersRO = ({ offers, status, st }: { offers: OfferRow[]; status: string; st: (k: string) => StatusRow | undefined }) => (
  <div className="tpl ro">
    {offers.map((t, i) => {
      const c = calcOffer({ amount: t.Amount, months: t.Months, rate: t.Rate, fee: t.Fee, insMonth: t.InsMonth });
      return (
        <div key={t.ID} className={t.ChosenOn ? 'chosen' : undefined}>
          <b>
            {offers.length > 1 && <OfferNum i={i} status={status} chosen={!!t.ChosenOn} st={st} />}
            {t.ChosenOn ? '✓ მომხმარებელმა აირჩია' : 'შეთავაზება'}
          </b>
          <em>
            {money(t.Amount, t.Currency)} · {t.Rate}% · {t.Months} თვე · თვეში <strong>{money(c?.monthly ?? 0, t.Currency)}</strong>
          </em>
        </div>
      );
    })}
  </div>
);

/** Status change form in the modal: offer (cards), reason (reject / cancel), or "loan issued". */
function ActionModal({ d, act, st, onClose, onDone }: { d: Detail; act: Act; st: (k: string) => StatusRow | undefined; onClose: () => void; onDone: () => void }) {
  const a = d.Application;
  const { cities, rejectReasons, cancelReasons, offerTypes } = useRefs();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async (body: object) => {
    setBusy(true);
    setError('');
    try {
      await api('PUT', `/partner/application/changeStatus/${d.ID}/${d.UID}`, { Status: act.Status, ...body });
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? [e.message, ...e.details.map((x) => x.Message)].join(' — ') : 'შეცდომა');
    } finally {
      setBusy(false);
    }
  };
  const h4 = (title: string) => (
    <h4>
      <span>{title}</span>
      <span className={`st ${d.Status}`}>{st(d.Status)?.PartnerLabel}</span>
    </h4>
  );

  return (
    <Modal
      title="სტატუსის ცვლილება"
      onClose={onClose}
      head={
        <>
          <div>
            <p>{a.ProductType.NameKa}</p>
            <p className="sub2">{applicantName(d)}</p>
          </div>
          <div className="mright">
            <b>{money(a.Amount, a.Currency)}</b>
            <small>
              {cities.find((c) => c.ID === a.CityID)?.NameKa ?? '—'} · {fmtDate(a.CreatedOn)}
            </small>
          </div>
        </>
      }
    >
      <div className="form main-form">
        {act.RequiresOffer ? (
          <OfferForm d={d} offerTypes={offerTypes} h4={h4('შეთავაზების პირობები')} busy={busy} onSend={(ids) => send({ Offers: ids.map((id) => ({ CardID: id })) })} onClose={onClose} />
        ) : act.RequiresIssued ? (
          <DoneForm h4={h4('დასრულება')} busy={busy} onSend={() => send({ Issued: true })} onClose={onClose} />
        ) : (
          <ReasonForm h4={h4('გაუქმების მიზეზი')} list={act.ReasonKind === 'reject' ? rejectReasons : cancelReasons} busy={busy} onSend={(ids, text) => send({ ReasonIDs: ids, ReasonText: text })} onClose={onClose} />
        )}
        <ErrorLine error={error} />
      </div>
    </Modal>
  );
}

function OfferForm({ d, offerTypes, h4, busy, onSend, onClose }: { d: Detail; offerTypes: Named[]; h4: React.ReactNode; busy: boolean; onSend: (ids: number[]) => void; onClose: () => void }) {
  const a = d.Application;
  // cards the staff member may offer: active, of this product type and currency (the API filters products by scope)
  const cards = useQuery({ queryKey: ['cards-all'], queryFn: () => findAll<Card & { Product: { ID: number; ProductTypeID: number; IsEnable?: boolean } }>('partner', 'card') });
  const products = useQuery({ queryKey: ['products-all'], queryFn: () => findAll<{ ID: number; IsEnable: boolean; ProductType: { NameKa: string } }>('partner', 'product') });
  const list = (cards.data ?? []).filter((c) => c.IsEnable && c.Currency === a.Currency && c.Product.ProductTypeID === a.ProductTypeID && products.data?.find((p) => p.ID === c.ProductID)?.IsEnable);
  const [picked, setPicked] = useState<Set<number> | null>(null);
  const sel = picked ?? new Set(list[0] ? [list[0].ID] : []);
  const name = (c: Card) => `${products.data?.find((p) => p.ID === c.ProductID)?.ProductType.NameKa ?? ''} · ${offerTypes.find((o) => o.ID === c.OfferTypeID)?.NameKa ?? ''}`;
  return (
    <>
      {h4}
      <div className="tpl">
        {!list.length && <div className="empty small">{cards.isLoading ? 'იტვირთება…' : 'ამ პროდუქტზე და ვალუტაზე აქტიური შეთავაზების ტიპი არ არის'}</div>}
        {list.map((c) => {
          const t = cardTerms(c, Number(a.Amount));
          const on = sel.has(c.ID);
          return (
            <label key={c.ID} className={on ? 'on' : ''}>
              <input
                type="checkbox"
                checked={on}
                onChange={(e) => {
                  const n = new Set(sel);
                  if (e.target.checked) n.add(c.ID);
                  else n.delete(c.ID);
                  setPicked(n);
                }}
              />
              <i />
              <b>{name(c)}</b>
              <em>
                {t.rate}% · {t.months} თვე · თვეში <strong>{money(t.calc?.monthly ?? 0, c.Currency)}</strong>
              </em>
            </label>
          );
        })}
      </div>
      <div className="fbtns">
        <button type="button" className="btn btn-green" disabled={busy || !sel.size} onClick={() => onSend([...sel])}>
          {sel.size === 1 ? 'შეთავაზების გაგზავნა (1)' : `შეთავაზებების გაგზავნა (${sel.size})`}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          დახურვა
        </button>
      </div>
    </>
  );
}

function ReasonForm({ h4, list, busy, onSend, onClose }: { h4: React.ReactNode; list: Named[]; busy: boolean; onSend: (ids: number[], text: string | null) => void; onClose: () => void }) {
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [other, setOther] = useState(false);
  const [text, setText] = useState('');
  const ok = (picked.size > 0 || other) && (!other || text.trim());
  return (
    <>
      {h4}
      <div className="tpl rs">
        {list.map((r) => (
          <label key={r.ID} className={picked.has(r.ID) ? 'on' : ''}>
            <input
              type="checkbox"
              checked={picked.has(r.ID)}
              onChange={(e) => {
                const n = new Set(picked);
                if (e.target.checked) n.add(r.ID);
                else n.delete(r.ID);
                setPicked(n);
              }}
            />
            <i />
            <b>{r.NameKa}</b>
          </label>
        ))}
        <label className={other ? 'on' : ''}>
          <input type="checkbox" checked={other} onChange={(e) => setOther(e.target.checked)} />
          <i />
          <b>სხვა</b>
        </label>
      </div>
      <textarea placeholder="აღწერე მიზეზი (სხვა)" disabled={!other} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="fbtns">
        <button type="button" className="btn btn-red" disabled={busy || !ok} onClick={() => onSend([...picked], other ? text.trim() : null)}>
          გაუქმება
        </button>
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          დახურვა
        </button>
      </div>
    </>
  );
}

function DoneForm({ h4, busy, onSend, onClose }: { h4: React.ReactNode; busy: boolean; onSend: () => void; onClose: () => void }) {
  const [ok, setOk] = useState(false);
  return (
    <>
      {h4}
      <div className="tpl rs">
        <label className={ok ? 'on' : ''}>
          <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} />
          <i />
          <b>სესხი დამტკიცდა და გაცემულია</b>
        </label>
      </div>
      <div className="fbtns">
        <button type="button" className="btn btn-green" disabled={busy || !ok} onClick={onSend}>
          დასრულება
        </button>
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          დახურვა
        </button>
      </div>
    </>
  );
}

export type { Card, Ref };
