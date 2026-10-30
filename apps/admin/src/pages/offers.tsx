import { Fragment, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { crud } from '../api/client';
import { useAll, useFind, useRoutedItem } from '../api/hooks';
import { fmtDate } from '../ui/controls';
import { Dialog } from '../ui/dialog';
import { Icon } from '../ui/icons';
import { DataTable, ListPage, Pager, StateRow, usePageSize } from '../ui/list-page';
import { OrgLite } from './common';
import { Application, AppOrg, fullName, LocationFilter, money, OfferDetail, OrgStatus, PeriodFilter, scopeFilter, toggleIn, useLookups, useScope } from './app-parts';
import { useQuery } from '@tanstack/react-query';

// Offers (prototype renderOffers / offerDialog): one row per application × organisation.
// The monitoring matrix opens this page with ?status=…&passed=1[&org=…].

type OfferRow = AppOrg & { Application: Application };

const Chevron = () => (
  <svg viewBox="0 0 24 24">
    <path d="M6 9l6 6 6-6" />
  </svg>
);

/** Offer record with status history (detail). */
const useOfferDetail = (o: { ID: number; UID: string } | null) =>
  useQuery({ queryKey: ['offer', 'detail', o?.ID], queryFn: () => crud.detail<OfferRow>('offer', o!), enabled: !!o });

export function OffersPage() {
  const [params, setParams] = useSearchParams();
  const [size, setSize] = usePageSize();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [scope, setScope] = useScope();
  const [open, setOpen] = useState<Set<number>>(new Set());
  // the offer view is in the address: /offers/{ID}/{UID}
  const { item: view, open: setView, close: closeView } = useRoutedItem<OfferRow>('offer', '/offers');
  const { st, statuses, place } = useLookups();
  const orgs = useAll<OrgLite & { IsPartner: boolean }>('organization', { Sort: [{ Field: 'Sort', Dir: 'asc' }] });

  const status = params.get('status') ?? '';
  const passed = params.get('passed') === '1';
  const org = params.get('org') ? Number(params.get('org')) : '';
  const setParam = (k: string, v: string) => {
    const p = new URLSearchParams(params);
    if (v) p.set(k, v);
    else p.delete(k);
    if (k === 'status') p.delete('passed'); // a status picked by hand = current status
    setParams(p, { replace: true });
  };

  const filter = { ...scopeFilter(scope), ...(search ? { Search: search } : {}), ...(status ? { Status: status, Passed: passed } : {}), ...(org !== '' ? { OrganizationID: org } : {}) };
  useEffect(() => setPage(1), [JSON.stringify(filter), size]);
  const q = useFind<OfferRow>('offer', page, size, { Filter: filter });
  const rows = q.data?.Items ?? [];

  return (
    <ListPage
      title="შეთავაზებები"
      desc={
        <>
          ერთი რიგი = მომხმარებლის ერთი განაცხადი ერთ ორგანიზაციასთან: სტატუსი, ტაიმერი, პირობები.
          {passed && status && ` ფილტრი: გაიარა სტატუსი „${st(status)?.PartnerLabel ?? status}" (მონიტორინგიდან).`}
        </>
      }
      filters={
        <>
          <input className="search" type="search" placeholder="ძებნა: სახელი, პირადი №, მობილური" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select aria-label="სტატუსი" value={status} onChange={(e) => setParam('status', e.target.value)}>
            <option value="">ყველა სტატუსი</option>
            {statuses.map((s) => (
              <option key={s.Key} value={s.Key}>
                {s.PartnerLabel}
              </option>
            ))}
          </select>
          <select aria-label="ორგანიზაცია" value={org} onChange={(e) => setParam('org', e.target.value)}>
            <option value="">ყველა ორგანიზაცია</option>
            {(orgs.data ?? []).filter((o) => o.IsPartner).map((o) => (
              <option key={o.ID} value={o.ID}>
                {o.NameKa}
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
            <th style={{ width: 340 }}>პროდუქტი</th>
            <th className="num w3">თანხა</th>
            <th style={{ width: 280 }}>მომხმარებელი</th>
            <th>ორგანიზაცია</th>
            <th className="acts" />
          </tr>
        }
      >
        {rows.length === 0 ? (
          <StateRow span={5} loading={q.isLoading} error={q.error?.message} empty="შეთავაზება არ მოიძებნა" />
        ) : (
          rows.map((o) => {
            const a = o.Application;
            const op = open.has(o.ID);
            return (
              <Fragment key={o.ID}>
                <tr className={op ? 'open' : ''}>
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
                      {fullName(a)}
                    </span>
                    <span className="sub">{a.Email || '-'}</span>
                    <span className="sub">{a.Phone || '-'}</span>
                  </td>
                  <td>
                    <OrgStatus o={o} st={st} reason />
                  </td>
                  <td className="acts">
                    <button type="button" className="ib" title="ნახვა" onClick={() => setView(o)}>
                      <Icon.eye />
                    </button>{' '}
                    <button type="button" className="ib tg" title="შეთავაზება" aria-expanded={op} onClick={() => setOpen((s) => toggleIn(s, o.ID))}>
                      <Chevron />
                    </button>
                  </td>
                </tr>
                {op && <OfferExpRow o={o} />}
              </Fragment>
            );
          })
        )}
      </DataTable>
      {view && <OfferDialog o={view} onClose={closeView} />}
    </ListPage>
  );
}

function OfferExpRow({ o }: { o: OfferRow }) {
  const { st } = useLookups();
  const d = useOfferDetail(o);
  return (
    <tr className="exp">
      <td colSpan={5}>
        <div className="off-exp">{d.data ? <OfferDetail app={d.data.Application} o={d.data} st={st} /> : <p>იტვირთება…</p>}</div>
      </td>
    </tr>
  );
}

function OfferDialog({ o, onClose }: { o: OfferRow; onClose: () => void }) {
  const { st, place } = useLookups();
  const d = useOfferDetail(o);
  const a = o.Application;
  return (
    <Dialog title={`შეთავაზება · ${o.Organization.NameKa}`} onClose={onClose} wide>
      <div className="kv">
        <span>მომხმარებელი</span>
        <b>{fullName(a)}</b>
        <span>პირადი ნომერი</span>
        <b>{a.Pid}</b>
        <span>კონტაქტი</span>
        <b>{[a.Email, a.Phone].filter(Boolean).join(' · ')}</b>
        <span>ლოკაცია</span>
        <b>{place(a)}</b>
      </div>
      {d.data ? <OfferDetail app={d.data.Application} o={d.data} st={st} head /> : <p>იტვირთება…</p>}
    </Dialog>
  );
}
