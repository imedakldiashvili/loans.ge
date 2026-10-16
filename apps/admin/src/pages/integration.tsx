import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useFind, useRoutedItem } from '../api/hooks';
import { fmtDate } from '../ui/controls';
import { Dialog } from '../ui/dialog';
import { Icon } from '../ui/icons';
import { DataTable, ListPage, Pager, StateRow, usePageSize } from '../ui/list-page';

// Integration (menu group "ინტეგრაცია"): partners' API keys (read only — organisations manage their own)
// and every webhook delivery with its attempts. API description: {API}/docs (Swagger).

const API_DOCS = `${import.meta.env.VITE_API_PUBLIC_URL ?? 'http://localhost:4000'}/docs`;

export function IntegrationPage() {
  const { key = 'keys' } = useParams();
  return key === 'webhooks' ? <WebhookLogPage /> : <ApiKeysPage />;
}

interface Key {
  ID: number;
  UID: string;
  IsEnable: boolean;
  Name: string;
  Prefix: string;
  Scopes: string[];
  LastUsedOn: string | null;
  ExpiresOn: string | null;
  CreatedOn: string;
  Organization: { ID: number; NameKa: string };
}

function ApiKeysPage() {
  const q = useFind<Key>('apiKey', 1, 100, {});
  const rows = q.data?.Items ?? [];
  return (
    <ListPage
      title="ინტეგრაცია · API გასაღებები"
      desc={
        <>
          ორგანიზაციების API გასაღებები — ბანკის სისტემა მათით მუშაობს partner API-ზე (X-Api-Key). გასაღებებს ორგანიზაციის ბექ-ოფისი ქმნის კაბინეტში (ინტეგრაცია); თავად გასაღები არსად ინახება.{' '}
          <a href={API_DOCS} target="_blank" rel="noreferrer">
            API დოკუმენტაცია (Swagger)
          </a>
        </>
      }
    >
      <DataTable
        className="wide"
        head={
          <tr>
            <th>ორგანიზაცია</th>
            <th>სახელი</th>
            <th className="w4">გასაღები</th>
            <th>უფლებები</th>
            <th className="w5">ბოლო გამოყენება</th>
            <th className="w2">სტატუსი</th>
          </tr>
        }
      >
        {rows.length === 0 ? (
          <StateRow span={6} loading={q.isLoading} error={q.error?.message} />
        ) : (
          rows.map((k) => (
            <tr key={k.ID} className={k.IsEnable ? '' : 'inactive'}>
              <td>{k.Organization.NameKa}</td>
              <td>{k.Name}</td>
              <td>
                <code>lgk_{k.Prefix}_…</code>
              </td>
              <td>{k.Scopes.join(', ')}</td>
              <td>{k.LastUsedOn ? fmtDate(k.LastUsedOn) : '—'}</td>
              <td>
                <span className={`tag ${k.IsEnable ? 'green' : 'grey'}`}>{k.IsEnable ? 'აქტიური' : 'გამორთული'}</span>
              </td>
            </tr>
          ))
        )}
      </DataTable>
    </ListPage>
  );
}

interface Delivery {
  ID: number;
  UID: string;
  Event: string;
  Status: 'pending' | 'ok' | 'failed';
  Attempts: number;
  NextAttemptOn: string | null;
  LastAttemptOn: string | null;
  DeliveredOn: string | null;
  ResponseCode: number | null;
  ResponseBody: string | null;
  Error: string | null;
  DurationMs: number | null;
  Payload: unknown;
  CreatedOn: string;
  Endpoint: { Url: string; Organization: { NameKa: string } };
}
const ST: Record<Delivery['Status'], [string, string]> = { ok: ['მიწოდებულია', 'green'], pending: ['მოლოდინში', 'amber'], failed: ['ვერ მიეწოდა', 'red'] };

function WebhookLogPage() {
  const [size, setSize] = usePageSize();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const { item: open, open: setOpen, close: closeOpen } = useRoutedItem<Delivery>('webhookDelivery', '/integration/webhooks');
  useEffect(() => setPage(1), [status, size]);
  const q = useFind<Delivery>('webhookDelivery', page, size, { Filter: status ? { Status: status } : {} });
  const rows = q.data?.Items ?? [];
  return (
    <ListPage
      title="ინტეგრაცია · webhook-ების ლოგი"
      desc="ყოველი webhook-ის მიწოდება ორგანიზაციის სისტემაში: მოვლენა, მცდელობები, პასუხი. წარუმატებელი იმეორებს 1 წთ, 5 წთ, 30 წთ, 2 სთ და 6 სთ-ში, მერე წყდება."
      filters={
        <select aria-label="სტატუსი" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">ყველა</option>
          <option value="ok">მიწოდებული</option>
          <option value="pending">მოლოდინში</option>
          <option value="failed">ვერ მიეწოდა</option>
        </select>
      }
      foot={<Pager page={page} totalPages={q.data?.TotalPages ?? 1} size={size} onPage={setPage} onSize={setSize} />}
    >
      <DataTable
        className="wide"
        head={
          <tr>
            <th className="w5">დრო</th>
            <th>ორგანიზაცია · მისამართი</th>
            <th className="w4">მოვლენა</th>
            <th className="num w2">ცდა</th>
            <th className="num w2">კოდი</th>
            <th className="w3">სტატუსი</th>
            <th className="acts" style={{ width: 56 }} />
          </tr>
        }
      >
        {rows.length === 0 ? (
          <StateRow span={7} loading={q.isLoading} error={q.error?.message} />
        ) : (
          rows.map((d) => (
            <tr key={d.ID}>
              <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(d.CreatedOn)}</td>
              <td style={{ wordBreak: 'break-all' }}>
                {d.Endpoint.Organization.NameKa}
                <span className="sub">{d.Endpoint.Url}</span>
                {d.Error && <span className="sub" style={{ color: 'var(--red)' }}>{d.Error}</span>}
              </td>
              <td>
                <code>{d.Event}</code>
              </td>
              <td className="num">{d.Attempts}</td>
              <td className="num">{d.ResponseCode ?? '—'}</td>
              <td>
                <span className={`tag ${ST[d.Status][1]}`}>{ST[d.Status][0]}</span>
              </td>
              <td className="acts">
                <button type="button" className="ib" title="დეტალები" onClick={() => setOpen(d)}>
                  <Icon.eye />
                </button>
              </td>
            </tr>
          ))
        )}
      </DataTable>
      {open && (
        <Dialog title={`${open.Event} · ${fmtDate(open.CreatedOn)}`} onClose={closeOpen} wide>
          <div className="kv">
            <span>UID</span>
            <b>
              <code>{open.UID}</code>
            </b>
            <span>მისამართი</span>
            <b style={{ wordBreak: 'break-all' }}>{open.Endpoint.Url}</b>
            <span>შედეგი</span>
            <b>
              {ST[open.Status][0]} · ცდა {open.Attempts}
              {open.ResponseCode ? ` · ${open.ResponseCode}` : ''}
              {open.DurationMs !== null ? ` · ${open.DurationMs} მწმ` : ''}
              {open.Error ? ` · ${open.Error}` : ''}
            </b>
            {open.Status === 'pending' && open.NextAttemptOn && (
              <>
                <span>შემდეგი ცდა</span>
                <b>{fmtDate(open.NextAttemptOn)}</b>
              </>
            )}
          </div>
          <div className="oe-det two" style={{ marginTop: 12 }}>
            <div className="oe-col">
              <h5>გაგზავნილი</h5>
              <pre style={{ margin: 0, maxHeight: 260, overflow: 'auto', fontSize: 12, background: 'var(--bg-soft)', padding: 10, borderRadius: 6 }}>{JSON.stringify(open.Payload, null, 2)}</pre>
            </div>
            <div className="oe-col">
              <h5>პასუხი</h5>
              <pre style={{ margin: 0, maxHeight: 260, overflow: 'auto', fontSize: 12, background: 'var(--bg-soft)', padding: 10, borderRadius: 6 }}>{open.ResponseBody || '—'}</pre>
            </div>
          </div>
        </Dialog>
      )}
    </ListPage>
  );
}
