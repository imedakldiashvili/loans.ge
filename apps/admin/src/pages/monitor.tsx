import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAll } from '../api/hooks';
import { CATEGORIES, OrgLite, OrgMark, STATUS_CATEGORIES, statusColor } from './common';
import { LocationFilter, PeriodFilter, scopeFilter, useLookups, useScope } from './app-parts';

// Monitoring (prototype renderMonitor): tiles — applications / offers per category with a per-status breakdown;
// matrix — organisation × statuses passed through; a cell opens the offers list filtered by it.

interface Pair {
  Applications: number;
  Offers: number;
}
interface Summary {
  Tiles: { Total: Pair; Progress: Pair; Complete: Pair; Canceled: Pair };
  Breakdown: ({ Status: string } & Pair)[];
  Statuses: { Key: string; ChipLabel: string; Category: string; Color: string | null }[];
  Matrix: { Organization: OrgLite; Counts: { Status: string; Count: number }[] }[];
  Totals: { Status: string; Count: number }[];
}

const pair = (p?: Pair) => (
  <>
    {p?.Applications ?? 0}
    <i className="of">/{p?.Offers ?? 0}</i>
  </>
);

export function MonitorPage() {
  const nav = useNavigate();
  const [scope, setScope] = useScope();
  const [org, setOrg] = useState<number | ''>('');
  const { statuses } = useLookups();
  const orgs = useAll<OrgLite & { IsPartner: boolean; IsEnable: boolean; Sort: number }>('organization', { Sort: [{ Field: 'Sort', Dir: 'asc' }] });
  const filter = { ...scopeFilter(scope), ...(org !== '' ? { OrganizationID: org } : {}) };
  const q = useQuery({ queryKey: ['monitor', filter], queryFn: () => api<Summary>('POST', '/admin/monitor/summary', { Filter: filter }) });
  const d = q.data;

  const color = (k: string) => statusColor(statuses.find((s) => s.Key === k), k);
  const label = (k: string) => statuses.find((s) => s.Key === k)?.ChipLabel ?? k;
  const keys = (d?.Statuses ?? []).map((s) => s.Key);
  const groups = STATUS_CATEGORIES.map((c) => ({ ...c, keys: (d?.Statuses ?? []).filter((s) => s.Category === c.key).map((s) => s.Key) })).filter((g) => g.keys.length);
  const tileOf = (c: string) => d?.Tiles[(c.charAt(0).toUpperCase() + c.slice(1)) as 'Progress'];
  const br = (k: string) => d?.Breakdown.find((b) => b.Status === k);
  const count = (list: { Status: string; Count: number }[] | undefined, k: string) => list?.find((c) => c.Status === k)?.Count ?? 0;
  // organisations shown in the matrix: partners (all of them, even with no records), filtered by the organisation select
  const rows = (orgs.data ?? []).filter((o) => o.IsPartner && (org === '' || o.ID === org));
  const open = (status: string, orgId?: number) => nav(`/offers?status=${status}&passed=1${orgId ? `&org=${orgId}` : ''}`);

  const cell = (n: number, k: string, orgId?: number) =>
    n ? (
      <button type="button" className="mcell" style={{ color: '#fff', background: color(k), borderColor: color(k) }} onClick={() => open(k, orgId)}>
        {n}
      </button>
    ) : (
      <span className="mz">—</span>
    );

  return (
    <>
      <div className="lp-top">
        <div className="lp-title">
          <h2>მონიტორინგი</h2>
          <p>ზემოთ — განაცხადები და შეთავაზებები სამ კატეგორიად (In Progress, Complete, Canceled); ცხრილში სტრიქონი — ორგანიზაცია, სვეტი — სტატუსი, უჯრა — რამდენი ჩანაწერი გაიარა ამ სტატუსში (დაჭერით იხსნება სია).</p>
        </div>
      </div>
      <div className="lp-filters">
        <select aria-label="ორგანიზაცია" value={org} onChange={(e) => setOrg(e.target.value ? Number(e.target.value) : '')}>
          <option value="">ყველა ორგანიზაცია</option>
          {(orgs.data ?? []).filter((o) => o.IsPartner).map((o) => (
            <option key={o.ID} value={o.ID}>
              {o.NameKa}
            </option>
          ))}
        </select>
        <LocationFilter scope={scope} set={setScope} />
        <PeriodFilter scope={scope} set={setScope} />
      </div>
      <h3 className="sech">
        მომხმარებლის განაცხადები <small>განაცხადები / შეთავაზებები</small>
      </h3>
      <div className="tiles">
        <div className="tile tsum">
          <span>სულ</span>
          <b>{pair(d?.Tiles.Total)}</b>
          <small className="brk">
            {groups.map((g) => (
              <span key={g.key} className="bl">
                <span className={`c-${g.key}`}>
                  {g.en} · {g.ka}
                </span>
                <b>{pair(tileOf(g.key))}</b>
              </span>
            ))}
          </small>
        </div>
        {groups.map((g) => (
          <div key={g.key} className={`tile ${{ progress: 'hi', complete: 'ok', canceled: '' }[g.key]}`}>
            <span>
              {g.en} · {g.ka}
            </span>
            <b>{pair(tileOf(g.key))}</b>
            <small className="brk">
              {g.keys.map((k) => (
                <span key={k} className="bl">
                  <span style={{ color: color(k) }}>{label(k)}</span>
                  <b>{pair(br(k))}</b>
                </span>
              ))}
            </small>
          </div>
        ))}
      </div>
      <div className="panel">
        <h3 className="pcap">გავლილი სტატუსები</h3>
        <div className="tbl">
          <table className="matrix wide">
            <thead>
              <tr>
                <th className="w6 mfirst">
                  <span className="mlbl">ორგანიზაცია</span>
                </th>
                {keys.map((k) => (
                  <th key={k} className="num mh" style={{ color: color(k) }}>
                    <span className="mlbl">{label(k)}</span>
                    <div className="mtotal">{cell(count(d?.Totals, k), k)}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {q.isLoading ? (
                <tr>
                  <td colSpan={keys.length + 1} className="empty">
                    იტვირთება…
                  </td>
                </tr>
              ) : (
                rows.map((o) => {
                  const m = d?.Matrix.find((x) => x.Organization.ID === o.ID);
                  return (
                    <tr key={o.ID} className={o.IsEnable ? '' : 'inactive'}>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <OrgMark org={o} cls="fl" />
                        <b style={{ fontWeight: 500 }}>{o.NameKa}</b>
                        <span className="sub">{CATEGORIES[o.Category]?.ka ?? o.Category}</span>
                      </td>
                      {keys.map((k) => (
                        <td key={k} className={`num ${count(m?.Counts, k) ? '' : 'mz'}`}>
                          {cell(count(m?.Counts, k), k, o.ID)}
                        </td>
                      ))}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
