import { calcOffer } from '@loans/shared';
import { useQuery } from '@tanstack/react-query';
import { Fragment, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { crud } from '../api/client';
import { useAll, useFind, useRoutedItem } from '../api/hooks';
import { fmt, fmtDate } from '../ui/controls';
import { Dialog } from '../ui/dialog';
import { Icon } from '../ui/icons';
import { DataTable, ListPage, Pager, StateRow, usePageSize } from '../ui/list-page';
import { OrgMark, statusColor } from './common';
import { Application, AppOrg, fullName, LocationFilter, money, OfferDetail, OrgStatus, PeriodFilter, scopeFilter, toggleIn, useLookups, useScope } from './app-parts';

// Applications (prototype renderApps / appOrgsRow / appDialog / comparePage): one row per customer application,
// expanded — one row per organisation, each expands to its offer and status history.

const AstIcon = ({ active }: { active: boolean }) => (
  <span className={`ast ${active ? 'active' : 'done'}`} title={active ? 'მიმდინარე' : 'დასრულებული'}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d={active ? 'M12 7v5l3 2' : 'M8 12l3 3 5-6'} />
    </svg>
  </span>
);

const CompareIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 7.2A2.2 2.2 0 0 1 7.2 5h1a2.2 2.2 0 0 0 1.55-.64l.7-.7a2.2 2.2 0 0 1 3.12 0l.7.7c.42.41.97.64 1.55.64h1a2.2 2.2 0 0 1 2.2 2.2v1c0 .58.23 1.13.64 1.55l.7.7a2.2 2.2 0 0 1 0 3.12l-.7.7a2.2 2.2 0 0 0-.64 1.55v1a2.2 2.2 0 0 1-2.2 2.2h-1a2.2 2.2 0 0 0-1.55.64l-.7.7a2.2 2.2 0 0 1-3.12 0l-.7-.7a2.2 2.2 0 0 0-1.55-.64h-1a2.2 2.2 0 0 1-2.2-2.2v-1a2.2 2.2 0 0 0-.64-1.55l-.7-.7a2.2 2.2 0 0 1 0-3.12l.7-.7A2.2 2.2 0 0 0 5 8.2z" />
    <path d="M9 15l6-6" />
    <circle cx="9.5" cy="9.5" r="1" fill="currentColor" stroke="none" />
    <circle cx="14.5" cy="14.5" r="1" fill="currentColor" stroke="none" />
  </svg>
);

const Chevron = () => (
  <svg viewBox="0 0 24 24">
    <path d="M6 9l6 6 6-6" />
  </svg>
);

/** Application detail (organisations with offers and status history), loaded when needed. */
export const useAppDetail = (a: { ID: number; UID: string } | null) =>
  useQuery({ queryKey: ['application', 'detail', a?.ID], queryFn: () => crud.detail<Application>('application', a!), enabled: !!a });

export function AppsPage() {
  const nav = useNavigate();
  const [size, setSize] = usePageSize();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [state, setState] = useState('');
  const [product, setProduct] = useState<number | ''>('');
  const [scope, setScope] = useScope();
  const [open, setOpen] = useState<Set<number>>(new Set());
  // the application view is in the address: /apps/{ID}/{UID}
  const { item: view, open: setView, close: closeView } = useRoutedItem<Application>('application', '/apps');
  const { st, place } = useLookups();
  const products = useAll<{ ID: number; NameKa: string }>('productType', { Sort: [{ Field: 'Sort', Dir: 'asc' }] });
  const filter = { ...scopeFilter(scope), ...(search ? { Search: search } : {}), ...(state ? { State: state } : {}), ...(product !== '' ? { ProductTypeID: product } : {}) };
  useEffect(() => setPage(1), [JSON.stringify(filter), size]);
  const q = useFind<Application>('application', page, size, { Filter: filter });
  const rows = q.data?.Items ?? [];
  const toggle = (id: number) => setOpen((s) => toggleIn(s, id));

  return (
    <ListPage
      title="განაცხადები"
      desc="მომხმარებლების განაცხადები: ერთი რიგი = ერთი განაცხადი, რამდენ ორგანიზაციასაც არ უნდა გაეგზავნოს. განაცხადი ან მიმდინარეა (ერთ ორგანიზაციასთან მაინც მიმდინარეა), ან დასრულებული. ისრით — რა ხდება თითოეულ ორგანიზაციასთან, 👁-ში — განაცხადის დეტალები."
      filters={
        <>
          <input className="search" type="search" placeholder="ძებნა: სახელი, პირადი №, მობილური" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select aria-label="მდგომარეობა" value={state} onChange={(e) => setState(e.target.value)}>
            <option value="">ყველა განაცხადი</option>
            <option value="active">მიმდინარე</option>
            <option value="done">დასრულებული</option>
          </select>
          <select aria-label="პროდუქტი" value={product} onChange={(e) => setProduct(e.target.value ? Number(e.target.value) : '')}>
            <option value="">ყველა პროდუქტი</option>
            {(products.data ?? []).map((p) => (
              <option key={p.ID} value={p.ID}>
                {p.NameKa}
              </option>
            ))}
          </select>
          <LocationFilter scope={scope} set={setScope} />
          <PeriodFilter scope={scope} set={setScope} />
        </>
      }
      foot={<Pager page={page} totalPages={q.data?.TotalPages ?? 1} size={size} onPage={setPage} onSize={setSize} />}
    >
      <DataTable
        className="wide"
        head={
          <tr>
            <th className="ast-c" title="სტატუსი" />
            <th>პროდუქტი</th>
            <th className="num w3">თანხა</th>
            <th>მომხმარებელი</th>
            <th className="num w4">ორგანიზაცია</th>
            <th className="acts a3" />
          </tr>
        }
      >
        {rows.length === 0 ? (
          <StateRow span={6} loading={q.isLoading} error={q.error?.message} empty="განაცხადი არ მოიძებნა" />
        ) : (
          rows.map((a) => (
            <Fragment key={a.ID}>
              <tr className={open.has(a.ID) ? 'open' : ''}>
                <td className="ast-c">
                  <AstIcon active={a.State === 'active'} />
                </td>
                <td className="big">
                  <span className="loan-n">{a.ProductType.NameKa}</span>
                  <span className="sub">{place(a)}</span>
                  <span className="sub">
                    {fmtDate(a.CreatedOn)}
                    {a.Source ? ` · ${a.Source}` : ''}
                  </span>
                </td>
                <td className="num big">{money(a.Amount, a.Currency)}</td>
                <td className="cust">
                  <span className="cust-n">
                    <span className="pid">{a.Pid}</span>
                    {fullName(a) || '—'}
                  </span>
                  <span className="sub">{a.Email || '—'}</span>
                  <span className="sub">{a.Phone || '—'}</span>
                </td>
                <td className="num org-c">
                  <span className="otot" title="ორგანიზაციები">
                    {a.Orgs.length}
                  </span>
                  <span className="scs">
                    {(a.StatusCounts ?? []).map((c) => (
                      <span key={c.Status} className="sc" style={{ ['--c' as string]: statusColor(st(c.Status), c.Status) }} title={st(c.Status)?.PartnerLabel ?? c.Status}>
                        {c.Count}
                      </span>
                    ))}
                  </span>
                </td>
                <td className="acts">
                  <button type="button" className="ib" title="შეთავაზებები" onClick={() => nav(`/apps/${a.ID}/${a.UID}/compare`)}>
                    <CompareIcon />
                  </button>{' '}
                  <button type="button" className="ib" title="ნახვა" onClick={() => setView(a)}>
                    <Icon.eye />
                  </button>{' '}
                  <button type="button" className="ib tg" title="ორგანიზაციები" aria-expanded={open.has(a.ID)} onClick={() => toggle(a.ID)}>
                    <Chevron />
                  </button>
                </td>
              </tr>
              {open.has(a.ID) && <AppOrgsRow app={a} span={6} />}
            </Fragment>
          ))
        )}
      </DataTable>
      {view && <AppDialog app={view} onClose={closeView} />}
    </ListPage>
  );
}

/** Expanded application: one row per organisation, each expands to its offer and history. */
function AppOrgsRow({ app, span }: { app: Application; span: number }) {
  const { st } = useLookups();
  const detail = useAppDetail(app);
  const [open, setOpen] = useState<Set<number>>(new Set());
  const orgs: AppOrg[] = detail.data?.Orgs ?? app.Orgs;
  return (
    <tr className="exp">
      <td colSpan={span}>
        <div className="orgs-exp">
          {orgs.map((o) => {
            const op = open.has(o.ID);
            return (
              <div key={o.ID} className={`oe ${op ? 'open' : ''}`}>
                <div className="oe-top">
                  <OrgStatus o={o} st={st} />
                  <button type="button" className="ib tg" title="შეთავაზება" aria-expanded={op} onClick={() => setOpen((s) => toggleIn(s, o.ID))}>
                    <Chevron />
                  </button>
                </div>
                {op && <OfferDetail app={detail.data ?? app} o={o} st={st} />}
              </div>
            );
          })}
        </div>
      </td>
    </tr>
  );
}

/** Application view — same form as the customer cabinet (prototype appDialog). */
function AppDialog({ app, onClose }: { app: Application; onClose: () => void }) {
  const { st, place } = useLookups();
  const sec = (title: string, rows: [string, React.ReactNode][]) => (
    <div className="view-sec">
      <h4>{title}</h4>
      {rows.map(([k, v], i) => (
        <div key={i} className="view-row">
          <span>{k}</span>
          <b>{v || '—'}</b>
        </div>
      ))}
    </div>
  );
  const total = (app.Incomes ?? []).reduce((t, i) => t + (+i.Amount || 0), 0);
  const banks = (app.Banks ?? []).map((b) => (typeof b === 'string' ? b : b.Name + (b.Services?.length ? ` (${b.Services.join(', ')})` : ''))).join(', ');
  return (
    <Dialog title={`${app.ProductType.NameKa} · ${money(app.Amount, app.Currency)}`} onClose={onClose}>
      <p className="view-sub">
        <AstIcon active={app.State === 'active'} />
        {app.State === 'active' ? 'მიმდინარე' : 'დასრულებული'} · გაგზავნილია {fmtDate(app.CreatedOn)}
      </p>
      <div className="view-body">
        {sec('საკრედიტო ისტორია', [['სტატუსი', app.CreditHistory]])}
        {sec('ფინანსური მდგომარეობა', [['საქმიანობის სფერო', app.Sector], ...(app.Incomes ?? []).map((i): [string, string] => [i.Src, `${fmt(i.Amount)} ₾`]), ['ჯამური თვიური შემოსავალი', `${fmt(total)} ₾`], ['ბანკის სერვისები', banks]])}
        {sec('ორგანიზაციები', app.Orgs.map((o): [string, React.ReactNode] => [o.Organization.NameKa, <span className={`st ${o.Status}`}>{st(o.Status)?.PartnerLabel ?? o.Status}</span>]))}
        {sec('პირადი მონაცემები', [
          ['პირადი ნომერი', app.Pid], ['სახელი, გვარი', fullName(app)], ['დაბადების თარიღი', app.BirthDate ? app.BirthDate.slice(0, 10).split('-').reverse().join('.') : null],
          ['ქალაქი / უბანი', place(app)], ['მობილური ნომერი', app.Phone],
        ])}
      </div>
    </Dialog>
  );
}

// ── compare page — same form as the customer site (#compare); status row at the bottom, view only

const CMP_F = [
  { key: 'offer', label: 'დასადასტურებელი', d: 'M12 7.5v5.5M12 16.5h.01' },
  { key: 'accepted', label: 'დადასტურებული', d: 'M8 12l3 3 5-6' },
  { key: 'declined', label: 'უარყოფილი', d: 'M15 9l-6 6M9 9l6 6' },
];

export function ComparePage() {
  const { id = '', uid = '' } = useParams();
  const nav = useNavigate();
  const { st } = useLookups();
  const q = useAppDetail({ ID: Number(id), UID: uid });
  const [filter, setFilter] = useState(['offer', 'accepted', 'declined']);
  const a = q.data;
  const list = a ? CMP_F.flatMap((f) => (filter.includes(f.key) ? a.Orgs.filter((o) => o.Status === f.key) : [])) : [];
  const T = list.map((o) => {
    const t = o.Offers[0] ?? null;
    return { o, t, c: t ? calcOffer({ amount: t.Amount, months: t.Months, rate: t.Rate, fee: t.Fee, insMonth: t.InsMonth }) : null };
  });
  type Row = (typeof T)[number];
  const dense = list.length >= 5;
  const m = (v: number) => money(Math.round(v), a?.Currency);
  const row = (label: string, get: (x: Row) => number | null | undefined, f: (v: number) => string, best?: boolean, cls = '') => {
    const vals = T.map(get);
    const nums = vals.filter((v): v is number => typeof v === 'number');
    const bv = best && nums.length ? Math.min(...nums) : null;
    const many = nums.filter((v) => v === bv).length < nums.length;
    return (
      <tr className={cls}>
        <td>{label}</td>
        {vals.map((v, i) => (
          <td key={i} className={bv !== null && v === bv && many ? 'best' : ''}>
            {typeof v === 'number' ? f(v) : '—'}
          </td>
        ))}
        <td className="fill" />
      </tr>
    );
  };

  return (
    <>
      <div className="top">
        <button type="button" className="back" onClick={() => nav('/apps')}>
          <Icon.back />
          განაცხადები
        </button>
        <h2>შეთავაზებები · {a ? fullName(a) : ''}</h2>
      </div>
      <div className="cmp-page">
        {!a ? (
          <p className="cmp-empty">{q.isLoading ? 'იტვირთება…' : q.error?.message}</p>
        ) : (
          <>
            <div className="cmp-head">
              <p className="cmp-sub">
                {a.ProductType.NameKa} · <b>{money(a.Amount, a.Currency)}</b>
              </p>
              <div className="cmp-filter">
                {CMP_F.map((f) => (
                  <button key={f.key} type="button" className={`cmp-f f-${f.key} ${filter.includes(f.key) ? 'on' : ''}`} aria-pressed={filter.includes(f.key)} onClick={() => setFilter((x) => (x.includes(f.key) ? x.filter((k) => k !== f.key) : [...x, f.key]))}>
                    <span className="ico">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="9" />
                        <path d={f.d} />
                      </svg>
                    </span>
                    <span>{f.label}</span>
                    <span className="cnt">{a.Orgs.filter((o) => o.Status === f.key).length}</span>
                  </button>
                ))}
              </div>
            </div>
            {list.length ? (
              <div className="cmp-wrap">
                <table className={`cmp cli ${dense ? 'dense' : ''}`} style={{ minWidth: (dense ? 227 : 252) + list.length * (dense ? 170 : 200), width: '100%' }}>
                  <colgroup>
                    <col className="c0" />
                    {T.map((x) => (
                      <col key={x.o.ID} className="co" />
                    ))}
                    <col />
                  </colgroup>
                  <thead>
                    <tr>
                      <th />
                      {T.map(({ o }) => (
                        <th key={o.ID}>
                          <OrgMark org={o.Organization} cls="cm" />
                          <span className="cmp-on">{o.Organization.NameKa}</span>
                        </th>
                      ))}
                      <th className="fill" />
                    </tr>
                  </thead>
                  <tbody>
                    {row('თანხა', (x) => x.t?.Amount, m)}
                    {row('ვადა', (x) => x.t?.Months, (v) => `${v} თვე`)}
                    {row('წლიური განაკვეთი', (x) => x.t?.Rate, (v) => `${v}%`, true)}
                    {row('ეფექტური პროცენტი', (x) => x.c?.eff, (v) => `${v}%`, true)}
                    {row('ერთჯერადი საკომისიოები', (x) => x.t?.Fee, m, true)}
                    {row('ყოველთვიური გადასახადი', (x) => x.c?.monthly, m, true)}
                    {row('სულ გადასახდელი პროცენტი', (x) => x.c?.interest, m, true)}
                    {row('სულ გადასახდელი დაზღვევა', (x) => x.c?.insTotal, m, true)}
                    {row('სულ ძირის გარდა გადასახდელი', (x) => x.c?.costTotal, m, true)}
                    {row('სულ გადასახდელი', (x) => x.c?.total, m, true, 'total')}
                    <tr className="r-st">
                      <td>სტატუსი</td>
                      {T.map(({ o }) => (
                        <td key={o.ID}>
                          <span className={`st ${o.Status}`}>{st(o.Status)?.PartnerLabel ?? o.Status}</span>
                        </td>
                      ))}
                      <td className="fill" />
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="cmp-empty">ამ კატეგორიაში შეთავაზება არ არის</p>
            )}
          </>
        )}
      </div>
    </>
  );
}
