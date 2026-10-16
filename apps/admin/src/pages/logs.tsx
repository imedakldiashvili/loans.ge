import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { crud } from '../api/client';
import { useFind } from '../api/hooks';
import { fmtDate } from '../ui/controls';
import { Dialog } from '../ui/dialog';
import { Icon } from '../ui/icons';
import { DataTable, ListPage, Pager, StateRow, usePageSize } from '../ui/list-page';

// Logs (menu group "ლოგები"): every API call (action_log) and every run of a background job (job_run).
// Both are kept forever as an information source.

export function LogsPage() {
  const { key = 'actions' } = useParams();
  return key === 'jobs' ? <JobLogPage /> : <ActionLogPage />;
}

// ── action log
interface Log {
  ID: number;
  UID: string;
  Url: string;
  Method: string;
  Gateway: string | null;
  Module: string | null;
  Action: string | null;
  ItemID: number | null;
  CreatedBy: number | null;
  CreatedOn: string;
  DurationMs: number | null;
  ResponseCode: number | null;
  IsSuccess: boolean | null;
  ErrorCode: string | null;
  ErrorMessage: string | null;
  Ip: string | null;
}

function ActionLogPage() {
  const [size, setSize] = usePageSize();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [gateway, setGateway] = useState('');
  const [result, setResult] = useState('');
  const [open, setOpen] = useState<Log | null>(null);
  useEffect(() => setPage(1), [search, gateway, result, size]);
  const uid = /^[0-9a-f-]{36}$/i.test(search.trim()) ? search.trim() : '';
  const filter = { ...(uid ? { Uid: uid } : search ? { Search: search } : {}), ...(gateway ? { Gateway: gateway } : {}), ...(result ? { IsSuccess: result === 'ok' } : {}) };
  const q = useFind<Log>('actionLog', page, size, { Filter: filter });
  const rows = q.data?.Items ?? [];

  return (
    <ListPage
      title="ლოგები · ქმედებების ლოგი"
      desc="ყველა API ზარი UID-ით — წარმატებულიც და შეცდომითაც (actionLog). ინახება სამუდამოდ; მოთხოვნა და პასუხი — ცალკე, uid-ით. ძებნა URL-ით ან UID-ით."
      filters={
        <>
          <input className="search" type="search" placeholder="ძებნა: URL ან UID" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select aria-label="gateway" value={gateway} onChange={(e) => setGateway(e.target.value)}>
            <option value="">ყველა gateway</option>
            {['admin', 'partner', 'client', 'public'].map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
          <select aria-label="შედეგი" value={result} onChange={(e) => setResult(e.target.value)}>
            <option value="">ყველა შედეგი</option>
            <option value="ok">წარმატებული</option>
            <option value="err">შეცდომა</option>
          </select>
        </>
      }
      foot={<Pager page={page} totalPages={q.data?.TotalPages ?? 1} size={size} onPage={setPage} onSize={setSize} />}
    >
      <DataTable
        className="wide"
        head={
          <tr>
            <th className="w5">დრო</th>
            <th className="w2">მეთოდი</th>
            <th>URL</th>
            <th className="w4">მოდული · მოქმედება</th>
            <th className="num w2">კოდი</th>
            <th className="num w2">მწმ</th>
            <th className="w3">ვინ</th>
            <th className="acts" style={{ width: 56 }} />
          </tr>
        }
      >
        {rows.length === 0 ? (
          <StateRow span={8} loading={q.isLoading} error={q.error?.message} />
        ) : (
          rows.map((l) => (
            <tr key={l.ID}>
              <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(l.CreatedOn)}</td>
              <td>
                <code>{l.Method}</code>
              </td>
              <td style={{ wordBreak: 'break-all' }}>
                {l.Url}
                {l.ErrorMessage && <span className="sub" style={{ color: 'var(--red)' }}>{l.ErrorCode} · {l.ErrorMessage}</span>}
              </td>
              <td>
                {l.Module ?? '—'}
                <span className="sub">{l.Action ?? ''}</span>
              </td>
              <td className="num">
                <span className={`tag ${l.IsSuccess ? 'green' : 'red'}`}>{l.ResponseCode}</span>
              </td>
              <td className="num">{l.DurationMs}</td>
              <td>{l.CreatedBy ?? '—'}</td>
              <td className="acts">
                <button type="button" className="ib" title="დეტალები" onClick={() => setOpen(l)}>
                  <Icon.eye />
                </button>
              </td>
            </tr>
          ))
        )}
      </DataTable>
      {open && <LogDialog log={open} onClose={() => setOpen(null)} />}
    </ListPage>
  );
}

function LogDialog({ log, onClose }: { log: Log; onClose: () => void }) {
  const [detail, setDetail] = useState<{ Request: { Headers: unknown; Query: unknown; Body: unknown } | null; Response: { Body: unknown } | null } | null>(null);
  useEffect(() => {
    crud.detail<typeof detail>('actionLog', log).then(setDetail);
  }, [log]);
  const pre = (v: unknown) => <pre style={{ margin: 0, maxHeight: 260, overflow: 'auto', fontSize: 12, background: 'var(--bg-soft)', padding: 10, borderRadius: 6 }}>{JSON.stringify(v, null, 2)}</pre>;
  return (
    <Dialog title={`${log.Method} ${log.Module ?? ''} · ${log.Action ?? ''}`} onClose={onClose} wide>
      <div className="kv">
        <span>UID</span>
        <b>
          <code>{log.UID}</code>
        </b>
        <span>URL</span>
        <b>{log.Url}</b>
        <span>დრო</span>
        <b>
          {fmtDate(log.CreatedOn)} · {log.DurationMs} მწმ
        </b>
        <span>შედეგი</span>
        <b>
          {log.ResponseCode} {log.ErrorCode ? `· ${log.ErrorCode} · ${log.ErrorMessage}` : ''}
        </b>
        <span>IP</span>
        <b>{log.Ip ?? '—'}</b>
      </div>
      {!detail ? (
        <p>იტვირთება…</p>
      ) : (
        <div className="oe-det two" style={{ marginTop: 12 }}>
          <div className="oe-col">
            <h5>მოთხოვნა</h5>
            {pre(detail.Request)}
          </div>
          <div className="oe-col">
            <h5>პასუხი</h5>
            {pre(detail.Response?.Body)}
          </div>
        </div>
      )}
    </Dialog>
  );
}

// ── job log
interface JobRun {
  ID: number;
  UID: string;
  Job: string;
  Status: 'ok' | 'error';
  StartedOn: string;
  CompletedOn: string | null;
  DurationMs: number | null;
  Checked: number;
  Changed: number;
  Details: { ApplicationOrgID: number; From: string; To: string }[] | null;
  Error: string | null;
  Instance: string | null;
}

const JOBS: Record<string, { label: string; desc: string }> = {
  expiry: { label: 'ვადების შემოწმება', desc: 'ვადაგასული სტატუსი → ვადის გასვლის სტატუსი' },
};

function JobLogPage() {
  const [size, setSize] = usePageSize();
  const [page, setPage] = useState(1);
  const [job, setJob] = useState('');
  const [result, setResult] = useState('');
  const [onlyChanged, setOnlyChanged] = useState(true);
  const [open, setOpen] = useState<JobRun | null>(null);
  useEffect(() => setPage(1), [job, result, onlyChanged, size]);
  const filter = { ...(job ? { Job: job } : {}), ...(result ? { Status: result } : {}), ...(onlyChanged ? { OnlyChanged: true } : {}) };
  const q = useFind<JobRun>('jobRun', page, size, { Filter: filter });
  const rows = q.data?.Items ?? [];

  return (
    <ListPage
      title="ლოგები · ჯობების ლოგი"
      desc="ფონური ჯობების ყოველი გაშვება: რამდენი ჩანაწერი შეამოწმა, რა შეცვალა და შეცდომა, თუ იყო. ვადების ჯობი პერიოდულად ამოწმებს სტატუსების ვადას და ვადაგასულს ცვლის."
      filters={
        <>
          <select aria-label="ჯობი" value={job} onChange={(e) => setJob(e.target.value)}>
            <option value="">ყველა ჯობი</option>
            {Object.entries(JOBS).map(([k, j]) => (
              <option key={k} value={k}>
                {j.label}
              </option>
            ))}
          </select>
          <select aria-label="შედეგი" value={result} onChange={(e) => setResult(e.target.value)}>
            <option value="">ყველა შედეგი</option>
            <option value="ok">წარმატებული</option>
            <option value="error">შეცდომა</option>
          </select>
          <label className="chk" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={onlyChanged} onChange={(e) => setOnlyChanged(e.target.checked)} /> მხოლოდ ცვლილებით
          </label>
        </>
      }
      foot={<Pager page={page} totalPages={q.data?.TotalPages ?? 1} size={size} onPage={setPage} onSize={setSize} />}
    >
      <DataTable
        className="wide"
        head={
          <tr>
            <th className="w5">დაწყება</th>
            <th>ჯობი</th>
            <th className="num w2">შემოწმდა</th>
            <th className="num w2">შეიცვალა</th>
            <th className="num w2">მწმ</th>
            <th className="w2">შედეგი</th>
            <th className="w3">ინსტანსი</th>
            <th className="acts" style={{ width: 56 }} />
          </tr>
        }
      >
        {rows.length === 0 ? (
          <StateRow span={8} loading={q.isLoading} error={q.error?.message} />
        ) : (
          rows.map((r) => (
            <tr key={r.ID}>
              <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(r.StartedOn)}</td>
              <td>
                {JOBS[r.Job]?.label ?? r.Job}
                {r.Error && <span className="sub" style={{ color: 'var(--red)' }}>{r.Error}</span>}
              </td>
              <td className="num">{r.Checked}</td>
              <td className="num">{r.Changed ? <b>{r.Changed}</b> : 0}</td>
              <td className="num">{r.DurationMs ?? '—'}</td>
              <td>
                <span className={`tag ${r.Status === 'ok' ? 'green' : 'red'}`}>{r.Status === 'ok' ? 'OK' : 'შეცდომა'}</span>
              </td>
              <td>
                <code style={{ fontSize: 12 }}>{r.Instance ?? '—'}</code>
              </td>
              <td className="acts">
                <button type="button" className="ib" title="დეტალები" onClick={() => setOpen(r)}>
                  <Icon.eye />
                </button>
              </td>
            </tr>
          ))
        )}
      </DataTable>
      {open && (
        <Dialog title={`${JOBS[open.Job]?.label ?? open.Job} · ${fmtDate(open.StartedOn)}`} onClose={() => setOpen(null)} wide>
          <div className="kv">
            <span>UID</span>
            <b>
              <code>{open.UID}</code>
            </b>
            <span>რას აკეთებს</span>
            <b>{JOBS[open.Job]?.desc ?? '—'}</b>
            <span>დრო</span>
            <b>
              {fmtDate(open.StartedOn)} · {open.DurationMs ?? '—'} მწმ
            </b>
            <span>შედეგი</span>
            <b>
              შემოწმდა {open.Checked}, შეიცვალა {open.Changed}
              {open.Error ? ` · ${open.Error}` : ''}
            </b>
          </div>
          {open.Details?.length ? (
            <DataTable
              head={
                <tr>
                  <th>ჩანაწერი (application_org)</th>
                  <th>იყო</th>
                  <th>გახდა</th>
                </tr>
              }
            >
              {open.Details.map((d) => (
                <tr key={d.ApplicationOrgID}>
                  <td className="num">{d.ApplicationOrgID}</td>
                  <td>{d.From}</td>
                  <td>{d.To}</td>
                </tr>
              ))}
            </DataTable>
          ) : (
            <p style={{ marginTop: 12 }}>ამ გაშვებაში არაფერი შეცვლილა.</p>
          )}
        </Dialog>
      )}
    </ListPage>
  );
}
