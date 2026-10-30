import { calcOffer } from '@loans/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, Page } from '../api';
import { statusColor, useRefs } from '../session';
import { curSym, fmt, fmtDate } from '../ui/ui';
import { useProducts } from './products';

// Sent offers (back office): every offer the organisation's staff sent — newest first, with the customer, the record's
// status and who sent it. Data: POST /partner/offer/find. A row opens its application (/applications/{id}).

interface OfferItem {
  ID: number;
  Amount: number;
  Currency: string;
  Months: number;
  Rate: number;
  Fee: number;
  InsMonth: number;
  CreatedOn: string;
  ChosenOn: string | null;
  SentBy: string | null;
  Card: { ID: number; OfferTypeID: number } | null;
  ApplicationOrg: {
    ID: number;
    UID: string;
    Status: string;
    Application: { ID: number; FirstName: string; LastName: string; Pid: string | null; Phone: string | null; Email: string | null; ProductType: { ID: number; NameKa: string } };
  };
}

const PAGE = 10;
const TIMES = { '24h': 1, '7d': 7, '30d': 30 } as const;
const money = (n: number, cur: string) => `${fmt(n)} ${curSym(cur)}`;

export function OffersPage() {
  const refs = useRefs();
  const products = useProducts();
  const nav = useNavigate();
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [time, setTime] = useState<keyof typeof TIMES | 'all'>('all');
  const [chosen, setChosen] = useState('');
  const [page, setPage] = useState(1);

  const filter = useMemo(
    () => ({
      ...(search ? { Search: search } : {}),
      ...(type ? { ProductTypeID: Number(type) } : {}),
      ...(time !== 'all' ? { From: new Date(Date.now() - TIMES[time] * 864e5).toISOString() } : {}),
      ...(chosen ? { Chosen: chosen === 'yes' } : {}),
    }),
    [search, type, time, chosen],
  );
  useEffect(() => setPage(1), [filter]);
  const q = useQuery({ queryKey: ['offers', filter, page], queryFn: () => api<Page<OfferItem>>('POST', `/partner/offer/find/${page}/${PAGE}`, { Filter: filter }) });
  const st = (k: string) => refs.statuses.find((s) => s.Key === k);
  const rows = q.data?.Items ?? [];
  const pages = q.data?.TotalPages ?? 1;

  return (
    <div className="main">
      <div className="top">
        <h2>შეთავაზებები</h2>
        <span className="count">{q.data?.TotalCount ?? 0}</span>
      </div>
      <div className="srow">
        <input className="search" type="search" placeholder="ძებნა: პირადი ნომერი, სახელი გვარი, მობილური" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="fsel" aria-label="პროდუქტი" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">აირჩიე პროდუქტი</option>
          {(products.data ?? []).map((p) => (
            <option key={p.ID} value={p.ProductTypeID}>
              {p.ProductType.NameKa}
            </option>
          ))}
        </select>
        <select className="fsel" aria-label="მომხმარებლის არჩევანი" value={chosen} onChange={(e) => setChosen(e.target.value)}>
          <option value="">აირჩიე პასუხი</option>
          <option value="yes">მომხმარებელმა აირჩია</option>
          <option value="no">არ არის არჩეული</option>
        </select>
        <select className="fsel" aria-label="დრო" value={time} onChange={(e) => setTime(e.target.value as typeof time)}>
          <option value="all">აირჩიე პერიოდი</option>
          <option value="24h">ბოლო 24 საათი</option>
          <option value="7d">ბოლო კვირა</option>
          <option value="30d">ბოლო თვე</option>
        </select>
      </div>
      <div className="list">
        {!rows.length ? (
          <div className="empty">{q.isLoading ? 'იტვირთება…' : 'შეთავაზება არ მოიძებნა'}</div>
        ) : (
          rows.map((o) => {
            const r = o.ApplicationOrg;
            const a = r.Application;
            const s = st(r.Status);
            const c = calcOffer({ amount: o.Amount, months: o.Months, rate: o.Rate, fee: o.Fee, insMonth: o.InsMonth });
            const offerType = refs.offerTypes.find((t) => t.ID === o.Card?.OfferTypeID)?.NameKa;
            return (
              <div key={o.ID} className="card">
                <div className="row r4 link" role="link" tabIndex={0} title="განაცხადის გახსნა" onClick={() => nav(`/applications/${r.ID}`)} onKeyDown={(e) => e.key === 'Enter' && nav(`/applications/${r.ID}`)}>
                  <span className="ico" style={{ background: statusColor(s, r.Status), color: '#fff' }}>
                    <svg viewBox="0 0 24 24">
                      <path d="M20 12v9H4v-9M2 7h20v5H2zM12 21V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
                    </svg>
                  </span>
                  <span className="info">
                    <b>
                      {a.ProductType.NameKa} <span className="app-no">- #{a.ID}/{r.ID}</span>
                    </b>
                    {offerType && <small>{offerType}</small>}
                    <small>{fmtDate(o.CreatedOn)}</small>
                    {o.SentBy && (
                      <small className="taker" title="გაგზავნა">
                        👤 {o.SentBy}
                      </small>
                    )}
                  </span>
                  <span className="who-col">
                    <b>{`${a.Pid ? a.Pid + ' · ' : ''}${a.FirstName} ${a.LastName}`}</b>
                    {a.Phone && <small>+995 {a.Phone.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3')}</small>}
                    {a.Email && <small>{a.Email}</small>}
                  </span>
                  <span className="right">
                    <span className="amt">{money(o.Amount, o.Currency)}</span>
                    <span className="amt-line">
                      <small>
                        {o.Rate}% · {o.Months} თვე · თვეში {money(c?.monthly ?? 0, o.Currency)}
                      </small>
                    </span>
                    <span className="amt-line">
                      <span className="st-text" style={{ color: statusColor(s, r.Status) }}>
                        {o.ChosenOn ? '✓ მომხმარებელმა აირჩია' : (s?.ChipLabel ?? r.Status)}
                      </span>
                    </span>
                  </span>
                  <span className="ib tg" aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <path d="M9 6l6 6-6 6" />
                    </svg>
                  </span>
                </div>
              </div>
            );
          })
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
