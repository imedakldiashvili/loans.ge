import { calcOffer } from '@loans/shared';
import { useEffect, useState } from 'react';
import { Base } from '../api/client';
import { useAll } from '../api/hooks';
import { fmt, fmtDate } from '../ui/controls';
import { OrgLite, OrgMark, statusColor, StatusRow } from './common';

// Shared parts of the applications / offers / monitoring pages (prototype cmpTable, statusLogHtml, cdHtml, period & location filters).

export interface Offer {
  ID: number;
  UID: string;
  Amount: number;
  Currency: string;
  Months: number;
  Rate: number;
  Fee: number;
  InsMonth: number;
  CreatedOn: string;
  /** the customer chose this one (an organisation may have sent several) */
  ChosenOn?: string | null;
}
export interface StatusEvent {
  ID: number;
  FromStatus: string | null;
  ToStatus: string;
  Actor: string;
  CreatedOn: string;
}
export interface AppOrg {
  ID: number;
  UID: string;
  Status: string;
  StatusOn: string;
  SentOn: string;
  OfferOn: string | null;
  ExpiresOn: string | null;
  ReasonText: string | null;
  Organization: OrgLite;
  Offers: Offer[];
  Events?: StatusEvent[];
}
export interface Application extends Base {
  ProductType: { ID: number; NameKa: string; NameEn: string };
  Amount: number;
  Currency: string;
  Source: string | null;
  Pid: string;
  FirstName: string;
  LastName: string;
  BirthDate: string | null;
  Phone: string;
  Email: string | null;
  CityID: number | null;
  DistrictID: number | null;
  Village: string | null;
  CreditHistory: string | null;
  Sector: string | null;
  Incomes: { Src: string; Amount: number }[] | null;
  Banks: ({ Name: string; Services?: string[] } | string)[] | null;
  Orgs: AppOrg[];
  State?: 'active' | 'done';
  StatusCounts?: { Status: string; Count: number }[];
}

export const money = (n: number, cur = 'GEL') => `${fmt(n)} ${cur === 'GEL' ? '₾' : cur === 'USD' ? '$' : cur === 'EUR' ? '€' : cur}`;
export const fullName = (a: Pick<Application, 'FirstName' | 'LastName'>) => [a.FirstName, a.LastName].filter(Boolean).join(' ');

/** Statuses, cities, districts — loaded once, used for labels. */
export function useLookups() {
  const statuses = useAll<StatusRow>('status', { Sort: [{ Field: 'Sort', Dir: 'asc' }] }).data ?? [];
  const cities = useAll<{ ID: number; NameKa: string }>('city', { Sort: [{ Field: 'Sort', Dir: 'asc' }] }).data ?? [];
  const districts = useAll<{ ID: number; CityID: number; NameKa: string }>('district', { Sort: [{ Field: 'Sort', Dir: 'asc' }] }).data ?? [];
  const st = (k: string) => statuses.find((s) => s.Key === k);
  const place = (a: Pick<Application, 'CityID' | 'DistrictID' | 'Village'>) =>
    [cities.find((c) => c.ID === a.CityID)?.NameKa, districts.find((d) => d.ID === a.DistrictID)?.NameKa ?? a.Village].filter(Boolean).join(' · ') || '—';
  return { statuses, cities, districts, st, place };
}

// ── period & location filters (same state on monitoring, applications and offers — remembered)

export const TIME_F = [
  ['today', 'დღევანდელი'], ['yday', 'გუშინდელი'], ['yday2', 'გუშინწინდელი'], ['24h', 'ბოლო 24 საათი'],
  ['7d', 'ბოლო 1 კვირა'], ['30d', 'ბოლო 1 თვე'], ['custom', 'პერიოდი'], ['all', 'ყველა'],
] as const;

const read = (k: string, d: string) => {
  try {
    return localStorage.getItem(k) ?? d;
  } catch {
    return d;
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* storage blocked */
  }
};
const dtLocal = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

export interface Scope {
  time: string;
  from: string;
  to: string;
  cityId: number | '';
  districtId: number | '';
}

/** Filter state shared by the three pages. */
export function useScope(): [Scope, (p: Partial<Scope>) => void] {
  const [s, set] = useState<Scope>(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return { time: read('adminMonTime', 'all'), from: read('adminMonFrom', dtLocal(start)), to: read('adminMonTo', dtLocal(new Date())), cityId: '', districtId: '' };
  });
  return [
    s,
    (p) =>
      set((cur) => {
        const next = { ...cur, ...p };
        write('adminMonTime', next.time);
        write('adminMonFrom', next.from);
        write('adminMonTo', next.to);
        return next;
      }),
  ];
}

/** Scope → API filter fields (From / To / CityID / DistrictID). */
export function scopeFilter(s: Scope) {
  const day = (back: number) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return new Date(d.getTime() - back * 864e5);
  };
  const now = Date.now();
  let from: Date | undefined;
  let to: Date | undefined;
  if (s.time === 'today') from = day(0);
  else if (s.time === 'yday') (from = day(1)), (to = day(0));
  else if (s.time === 'yday2') (from = day(2)), (to = day(1));
  else if (s.time === '24h') from = new Date(now - 864e5);
  else if (s.time === '7d') from = new Date(now - 7 * 864e5);
  else if (s.time === '30d') from = new Date(now - 30 * 864e5);
  else if (s.time === 'custom') (from = s.from ? new Date(s.from) : undefined), (to = s.to ? new Date(new Date(s.to).getTime() + 59_999) : undefined);
  return {
    ...(from ? { From: from.toISOString() } : {}),
    ...(to ? { To: to.toISOString() } : {}),
    ...(s.cityId !== '' ? { CityID: s.cityId } : {}),
    ...(s.districtId !== '' ? { DistrictID: s.districtId } : {}),
  };
}

export function LocationFilter({ scope, set }: { scope: Scope; set: (p: Partial<Scope>) => void }) {
  const { cities, districts } = useLookups();
  const ds = districts.filter((d) => d.CityID === scope.cityId);
  return (
    <>
      <select aria-label="ქალაქი" value={scope.cityId} onChange={(e) => set({ cityId: e.target.value ? Number(e.target.value) : '', districtId: '' })}>
        <option value="">ყველა ქალაქი</option>
        {cities.map((c) => (
          <option key={c.ID} value={c.ID}>
            {c.NameKa}
          </option>
        ))}
      </select>
      {ds.length > 0 && (
        <select aria-label="უბანი" value={scope.districtId} onChange={(e) => set({ districtId: e.target.value ? Number(e.target.value) : '' })}>
          <option value="">ყველა უბანი</option>
          {ds.map((d) => (
            <option key={d.ID} value={d.ID}>
              {d.NameKa}
            </option>
          ))}
        </select>
      )}
    </>
  );
}

export function PeriodFilter({ scope, set }: { scope: Scope; set: (p: Partial<Scope>) => void }) {
  return (
    <div className="fright">
      {scope.time === 'custom' && (
        <span className="dtf">
          <input type="datetime-local" value={scope.from} step={60} aria-label="დან" onChange={(e) => set({ from: e.target.value })} />
          <span className="dash">–</span>
          <input type="datetime-local" value={scope.to} step={60} aria-label="მდე" onChange={(e) => set({ to: e.target.value })} />
        </span>
      )}
      <select aria-label="პერიოდი" value={scope.time} onChange={(e) => set({ time: e.target.value })}>
        {TIME_F.map(([k, l]) => (
          <option key={k} value={k}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}

// ── time displays

/** Ticks every second (one timer per mounted component). */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(t);
  }, [ms]);
  return now;
}

const cdText = (left: number) => {
  const s = Math.max(0, Math.ceil(left / 1e3));
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}`;
};
const hhmm = (ms: number) => {
  const m = Math.max(0, Math.round(ms / 60e3));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
export const fmtDur = (ms: number) => {
  const m = Math.max(0, Math.round(ms / 60e3));
  if (m < 60) return `${m} წთ`;
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  if (hh < 24) return `${hh} სთ${mm ? ' ' + mm + ' წთ' : ''}`;
  const d = Math.floor(hh / 24);
  const rh = hh % 24;
  return `${d} დღე${rh ? ' ' + rh + ' სთ' : ''}`;
};

/** Countdown to ExpiresOn (stops at 00:00:00), in the status colour. */
export function Countdown({ o, status }: { o: AppOrg; status?: StatusRow }) {
  const now = useNow();
  if (!o.ExpiresOn || status?.Category !== 'progress') return null;
  const left = new Date(o.ExpiresOn).getTime() - now;
  return (
    <span className={`cd ${left <= 0 ? 'over' : ''}`} style={{ ['--c' as string]: statusColor(status) }} title="დარჩენილი დრო (სთ:წთ:წმ)">
      {cdText(left)}
    </span>
  );
}

/** Organisation + status (+ countdown or the time it took, + reason) — prototype `.oe-who`. */
export function OrgStatus({ o, st, reason }: { o: AppOrg; st: (k: string) => StatusRow | undefined; reason?: boolean }) {
  const s = st(o.Status);
  const finished = s && s.Category !== 'progress';
  return (
    <span className="oe-org">
      <OrgMark org={o.Organization} />
      <span className="oe-who">
        <b>{o.Organization.NameKa}</b>
        <span className="st-rsn">
          <span className={`st ${o.Status}`}>{s?.PartnerLabel ?? o.Status}</span>
          {!finished && o.ExpiresOn && (
            <>
              <span className="sep"> - </span>
              <Countdown o={o} status={s} />
            </>
          )}
          {reason && o.ReasonText && <small className="rsn"> - {o.ReasonText}</small>}
        </span>
        {finished && (
          <span className="tl">
            დრო: <b>{hhmm(new Date(o.StatusOn).getTime() - new Date(o.SentOn).getTime())}</b>
          </span>
        )}
      </span>
    </span>
  );
}

const ACTOR: Record<string, string> = { customer: 'მომხმარებელი', partner: 'პარტნიორი', system: 'სისტემა', admin: 'ადმინი' };

/** Status history with time spent in each status (prototype statusLogHtml). */
export function StatusLog({ o, st }: { o: AppOrg; st: (k: string) => StatusRow | undefined }) {
  const now = useNow(30_000);
  const log = o.Events ?? [];
  return (
    <div className="oe-col">
      <h5>სტატუსების ცვლილება</h5>
      <div className="oe-log">
        <ol>
          {log.map((x, i) => {
            const nx = log[i + 1];
            const s = st(x.ToStatus);
            const at = new Date(x.CreatedOn).getTime();
            return (
              <li key={x.ID} style={{ ['--c' as string]: statusColor(s, x.ToStatus) }}>
                <i />
                <div>
                  <b>
                    {s?.PartnerLabel ?? x.ToStatus}
                    {nx ? (
                      <span className="dur">{fmtDur(new Date(nx.CreatedOn).getTime() - at)}</span>
                    ) : s?.Category === 'progress' ? (
                      <span className="dur live">{fmtDur(now - at)} — მიმდინარე</span>
                    ) : null}
                  </b>
                  <span>
                    {fmtDate(x.CreatedOn)} · {ACTOR[x.Actor] ?? x.Actor}
                  </span>
                  {i === log.length - 1 && o.ReasonText && <em>მიზეზი: {o.ReasonText}</em>}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

/** One organisation's offer(s) in the compare-table form (prototype cmpTable). */
export function OfferTable({ app, o, st, opts = {} }: { app: Application; o: AppOrg; st: (k: string) => StatusRow | undefined; opts?: { head?: boolean; status?: boolean } }) {
  const cols = (o.Offers.length ? o.Offers : [null]).map((t) => ({ t, c: t ? calcOffer({ amount: t.Amount, months: t.Months, rate: t.Rate, fee: t.Fee, insMonth: t.InsMonth }) : null }));
  type Col = (typeof cols)[number];
  const row = (label: string, get: (x: Col) => number | null | undefined, f: (v: number) => string, best?: 'min' | 'max', cls = '') => {
    const vals = cols.map(get);
    const nums = vals.filter((v): v is number => typeof v === 'number');
    const bestV = best && nums.length > 1 ? (best === 'max' ? Math.max(...nums) : Math.min(...nums)) : null;
    const allSame = nums.length > 0 && nums.every((v) => v === nums[0]);
    return (
      <tr className={cls}>
        <td>{label}</td>
        {vals.map((v, i) => (
          <td key={i} className={bestV !== null && v === bestV && !allSame ? 'best' : ''}>
            {v === null || v === undefined ? '—' : f(v)}
          </td>
        ))}
      </tr>
    );
  };
  const m = (v: number) => money(v, app.Currency);
  const s = st(o.Status);
  return (
    <div className="cmp-wrap">
      <table className="cmp one">
        {(opts.head || cols.length > 1) && (
          <thead>
            <tr>
              <th>
                {app.ProductType.NameKa} · {money(app.Amount, app.Currency)}
              </th>
              {cols.map((x, i) => (
                <th key={i}>
                  <OrgMark org={o.Organization} cls="cm" />
                  <span className="cmp-on">{o.Organization.NameKa}</span>
                  {/* several offers: each one's number, coloured by its status (unchosen offer of an accepted record — grey) */}
                  {cols.length > 1 && x.t && (
                    <span
                      className="of-num"
                      style={{ background: ['accepted', 'done'].includes(o.Status) && !x.t.ChosenOn ? 'var(--grey-status)' : statusColor(s, o.Status) }}
                      title={['accepted', 'done'].includes(o.Status) && !x.t.ChosenOn ? 'მომხმარებელმა არ აირჩია' : s?.PartnerLabel}
                    >
                      {i + 1}
                    </span>
                  )}
                  {x.t?.ChosenOn && <small className="chosen">✓ მომხმარებელმა აირჩია</small>}
                  {x.t && !x.t.ChosenOn && ['accepted', 'done'].includes(o.Status) && <small className="not-chosen">✕ მომხმარებელმა არ აირჩია</small>}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {opts.status && (
            <tr className="r-st">
              <td>სტატუსი</td>
              {cols.map((_, i) => (
                <td key={i}>
                  <span className={`st ${o.Status}`}>{s?.PartnerLabel ?? o.Status}</span>
                </td>
              ))}
            </tr>
          )}
          {row('თანხა', (x) => x.t?.Amount, m, 'max')}
          {row('ვადა', (x) => x.t?.Months, (v) => `${v} თვე`)}
          {row('წლიური განაკვეთი', (x) => x.t?.Rate, (v) => `${v}%`, 'min')}
          {row('ეფექტური პროცენტი', (x) => x.c?.eff, (v) => `${v}%`, 'min')}
          {row('ერთჯერადი საკომისიო', (x) => x.t?.Fee, m, 'min')}
          {row('ყოველთვიური გადასახადი', (x) => x.c?.monthly, m, 'min')}
          {row('სულ გადასახდელი პროცენტი', (x) => x.c?.interest, m, 'min')}
          {row('სულ გადასახდელი დაზღვევა', (x) => x.c?.insTotal, m, 'min')}
          {row('სულ გადასახდელი', (x) => x.c?.total, m, 'min', 'total')}
        </tbody>
      </table>
    </div>
  );
}

/** Expanded offer: offer table on the left, status history on the right. */
export function OfferDetail({ app, o, st, head }: { app: Application; o: AppOrg; st: (k: string) => StatusRow | undefined; head?: boolean }) {
  return (
    <div className="oe-det two">
      <div className="oe-col">
        <h5>შეთავაზება</h5>
        <OfferTable app={app} o={o} st={st} opts={head ? { head: true, status: true } : {}} />
      </div>
      <StatusLog o={o} st={st} />
    </div>
  );
}

/** Immutable add/remove for a Set state (updaters may run twice in StrictMode). */
export const toggleIn = (s: Set<number>, id: number) => {
  const n = new Set(s);
  if (n.has(id)) n.delete(id);
  else n.add(id);
  return n;
};
