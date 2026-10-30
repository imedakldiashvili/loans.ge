import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Navigate, NavLink, useParams } from 'react-router-dom';
import { api, ApiError, Page, Ref } from '../api';
import { EditIcon, ErrorLine, fmtDate, Modal, Switch, usePaged, useToast } from '../ui/ui';
import { DelIcon } from './products';

// Integration (back office): the organisation's own system works with the same partner API as this cabinet.
// Tabs: API keys (X-Api-Key) with scopes · webhooks (signed POSTs about new applications / status changes) · their delivery log —
// /integration/keys, /integration/webhooks, /integration/log.
// The full description of the API: Swagger at {API}/docs.

const API_DOCS = `${import.meta.env.VITE_API_PUBLIC_URL ?? 'http://localhost:4000'}/docs`;
const SCOPES: [string, string][] = [
  ['applications:read', 'განაცხადების ნახვა'],
  ['applications:write', 'სტატუსის ცვლილება / შეთავაზება'],
  ['catalog:read', 'პროდუქტების ნახვა'],
  ['catalog:write', 'პროდუქტების მართვა'],
];
const EVENTS: [string, string][] = [
  ['application.created', 'ახალი განაცხადი'],
  ['application.status', 'სტატუსის ცვლილება'],
];

interface Key extends Ref {
  IsEnable: boolean;
  Name: string;
  Prefix: string;
  Scopes: string[];
  LastUsedOn: string | null;
  ExpiresOn: string | null;
  CreatedOn: string;
}
interface Hook extends Ref {
  IsEnable: boolean;
  Url: string;
  Events: string[];
  CreatedOn: string;
}
interface Delivery extends Ref {
  Event: string;
  Status: 'pending' | 'ok' | 'failed';
  Attempts: number;
  NextAttemptOn: string | null;
  LastAttemptOn: string | null;
  ResponseCode: number | null;
  Error: string | null;
  CreatedOn: string;
  Endpoint: { Url: string };
}

const errText = (e: unknown) => (e instanceof ApiError ? [e.message, ...e.details.map((d) => d.Message)].join(' - ') : 'შეცდომა');
/** Row action icons: a test ping (paper plane) and a new signing key (key with a refresh arrow). */
const SendIcon = () => (
  <svg viewBox="0 0 24 24">
    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4z" />
  </svg>
);
const RotateKeyIcon = () => (
  <svg viewBox="0 0 24 24">
    <circle cx="8" cy="15" r="4" />
    <path d="M10.8 12.2L19 4M16 7l2 2M15 3h5v5" />
  </svg>
);

const items = <T,>(path: string, body: object = {}) => api<Page<T>>('POST', path, body).then((p) => p.Items);

// the three parts are tabs, each on its own address
const TABS = [
  ['keys', 'API გასაღებები'],
  ['webhooks', 'Webhook-ები'],
  ['log', 'მიწოდების ლოგი'],
] as const;

export function IntegrationPage() {
  const { tab = 'keys' } = useParams();
  if (!TABS.some(([k]) => k === tab)) return <Navigate to="/integration" replace />;
  return (
    <div className="main">
      <div className="top">
        <h2>ინტეგრაცია</h2>
      </div>
      <div className="card" style={{ padding: 16 }}>
        <p style={{ margin: 0 }}>
          თქვენი სისტემა იყენებს იმავე API-ს, რასაც ეს კაბინეტი: <code>/partner/…</code>, სათაურით <code>X-Api-Key</code>. ახალ განაცხადებსა და სტატუსის ცვლილებებს webhook-ით მიიღებს.
          აღწერა და მაგალითები:{' '}
          <a href={API_DOCS} target="_blank" rel="noreferrer">
            API დოკუმენტაცია (Swagger)
          </a>
          .
        </p>
      </div>
      <nav className="tabs">
        {TABS.map(([k, label]) => (
          <NavLink key={k} to={`/integration/${k}`} className={() => (k === tab ? 'on' : '')}>
            {label}
          </NavLink>
        ))}
      </nav>
      {tab === 'keys' && <Keys />}
      {tab === 'webhooks' && <Hooks />}
      {tab === 'log' && <Deliveries />}
    </div>
  );
}

/** Shown once after creating a key / secret, with a copy button. */
function SecretBox({ title, value, note, onClose }: { title: string; value: string; note: string; onClose: () => void }) {
  const toast = useToast();
  return (
    <Modal title={title} onClose={onClose}>
      <div className="form f main-form">
        <p>{note}</p>
        <code style={{ display: 'block', padding: 12, background: 'var(--bg-soft)', borderRadius: 6, wordBreak: 'break-all', userSelect: 'all' }}>{value}</code>
        <div className="fbtns">
          <button
            type="button"
            className="btn btn-green"
            onClick={async () => {
              await navigator.clipboard?.writeText(value).catch(() => undefined);
              toast('დაკოპირდა');
            }}
          >
            კოპირება
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            შევინახე, დახურვა
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Keys() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['apiKeys'], queryFn: () => items<Key>('/partner/apiKey/find/1/100') });
  const { shown: pageRows, pager } = usePaged(q.data ?? []);
  const [form, setForm] = useState(false);
  const [shown, setShown] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ['apiKeys'] });
  const run = async (fn: () => Promise<unknown>, msg: string) => {
    try {
      await fn();
      toast(msg);
      refresh();
    } catch (e) {
      toast(errText(e));
    }
  };
  return (
    <>
      <div className="top">
        <span />
        <button type="button" className="btn btn-green topbtn" onClick={() => setForm(true)}>
          + გასაღები
        </button>
      </div>
      <div className="list">
        {!q.data?.length && <div className="empty">{q.isLoading ? 'იტვირთება…' : 'გასაღები ჯერ არ არის'}</div>}
        {pageRows.map((k) => (
          <div key={k.ID} className="card">
            <div className="prow wide">
              <span className="pinfo">
                <b>{k.Name}</b>
                <small>
                  <code>lgk_{k.Prefix}_…</code> · {k.Scopes.map((s) => SCOPES.find((x) => x[0] === s)?.[1] ?? s).join(', ')}
                </small>
                <small>
                  ბოლო გამოყენება: {k.LastUsedOn ? fmtDate(k.LastUsedOn) : '-'}
                  {k.ExpiresOn ? ` · მოქმედებს ${fmtDate(k.ExpiresOn)}-მდე` : ''}
                </small>
              </span>
              <span className="racts p">
                <Switch on={k.IsEnable} onChange={(v) => run(() => api('PUT', `/partner/apiKey/${v ? 'enable' : 'disable'}/${k.ID}/${k.UID}`), v ? 'გასაღები ჩაირთო' : 'გასაღები გამოირთო')} />
                <button
                  type="button"
                  className="ib del"
                  title="წაშლა"
                  aria-label="წაშლა"
                  onClick={() => confirm(`წავშალოთ გასაღები „${k.Name}"? სისტემა, რომელიც მას იყენებს, ვეღარ შევა.`) && run(() => api('DELETE', `/partner/apiKey/delete/${k.ID}/${k.UID}`), 'გასაღები წაიშალა')}
                >
                  <DelIcon />
                </button>
              </span>
            </div>
          </div>
        ))}
      </div>
      {pager}
      {form && (
        <KeyForm
          onClose={() => setForm(false)}
          onCreated={(key) => {
            setForm(false);
            setShown(key);
            refresh();
          }}
        />
      )}
      {shown && <SecretBox title="ახალი API გასაღები" value={shown} note="გასაღები მხოლოდ ახლა ჩანს - შეინახე უსაფრთხო ადგილას. თუ დაიკარგა, წაშალე და ახალი შექმენი." onClose={() => setShown(null)} />}
    </>
  );
}

function KeyForm({ onClose, onCreated }: { onClose: () => void; onCreated: (key: string) => void }) {
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<string[]>(['applications:read', 'applications:write']);
  const [expires, setExpires] = useState('');
  const [error, setError] = useState('');
  const save = async () => {
    try {
      const r = await api<Ref & { Key: string }>('POST', '/partner/apiKey/add', { Name: name.trim(), Scopes: scopes, ExpiresOn: expires || null });
      onCreated(r.Key);
    } catch (e) {
      setError(errText(e));
    }
  };
  return (
    <Modal title="ახალი API გასაღები" onClose={onClose}>
      <div className="form f main-form">
        <div className="fld">
          <label htmlFor="kName">სახელი</label>
          <input id="kName" maxLength={80} placeholder="მაგ. ძირითადი სისტემა" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div className="fld">
          <label>უფლებები</label>
          <div className="tpl rs">
            {SCOPES.map(([s, label]) => (
              <label key={s} className={scopes.includes(s) ? 'on' : ''}>
                <input type="checkbox" checked={scopes.includes(s)} onChange={(e) => setScopes(e.target.checked ? [...scopes, s] : scopes.filter((x) => x !== s))} />
                <i />
                <b>{label}</b>
              </label>
            ))}
          </div>
        </div>
        <div className="fld">
          <label htmlFor="kExp">მოქმედების ვადა (არასავალდებულო)</label>
          <input id="kExp" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
        </div>
        <ErrorLine error={error} />
        <div className="fbtns">
          <button type="button" className="btn btn-green" disabled={!name.trim() || !scopes.length} onClick={save}>
            შექმნა
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            დახურვა
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Hooks() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['webhooks'], queryFn: () => items<Hook>('/partner/webhook/find/1/100') });
  const { shown: pageRows, pager } = usePaged(q.data ?? []);
  const [form, setForm] = useState<Hook | 'new' | null>(null);
  const [shown, setShown] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ['webhooks'] });
  const run = async (fn: () => Promise<unknown>, msg: string) => {
    try {
      await fn();
      toast(msg);
      refresh();
      qc.invalidateQueries({ queryKey: ['deliveries'] });
    } catch (e) {
      toast(errText(e));
    }
  };
  return (
    <>
      <div className="top">
        <span />
        <button type="button" className="btn btn-green topbtn" onClick={() => setForm('new')}>
          + webhook
        </button>
      </div>
      <div className="list">
        {!q.data?.length && <div className="empty">{q.isLoading ? 'იტვირთება…' : 'webhook ჯერ არ არის'}</div>}
        {pageRows.map((h) => (
          <div key={h.ID} className="card">
            <div className="prow wide">
              <span className="pinfo">
                <b style={{ wordBreak: 'break-all' }}>{h.Url}</b>
                <small>{h.Events.map((e) => EVENTS.find((x) => x[0] === e)?.[1] ?? e).join(', ')}</small>
              </span>
              <span className="racts p" style={{ flexWrap: 'wrap' }}>
                <Switch on={h.IsEnable} onChange={(v) => run(() => api('PUT', `/partner/webhook/${v ? 'enable' : 'disable'}/${h.ID}/${h.UID}`), v ? 'webhook ჩაირთო' : 'webhook გამოირთო')} />
                <button type="button" className="ib" title="ტესტი - სატესტო ping-ის გაგზავნა" aria-label="ტესტი" onClick={() => run(() => api('POST', `/partner/webhook/test/${h.ID}/${h.UID}`), 'სატესტო ping გაიგზავნა')}>
                  <SendIcon />
                </button>
                <button type="button" className="ib edit" title="რედაქტირება" aria-label="რედაქტირება" onClick={() => setForm(h)}>
                  <EditIcon />
                </button>
                <button
                  type="button"
                  className="ib"
                  title="გასაღების განახლება - ახალი ხელმოწერის გასაღები"
                  aria-label="გასაღების განახლება"
                  onClick={async () => {
                    if (!confirm('ახალი ხელმოწერის გასაღები? ძველი მაშინვე შეწყვეტს მუშაობას.')) return;
                    try {
                      setShown((await api<Ref & { Secret: string }>('PUT', `/partner/webhook/rotateSecret/${h.ID}/${h.UID}`)).Secret);
                    } catch (e) {
                      toast(errText(e));
                    }
                  }}
                >
                  <RotateKeyIcon />
                </button>
                <button type="button" className="ib del" title="წაშლა" aria-label="წაშლა" onClick={() => confirm('წავშალოთ webhook?') && run(() => api('DELETE', `/partner/webhook/delete/${h.ID}/${h.UID}`), 'webhook წაიშალა')}>
                  <DelIcon />
                </button>
              </span>
            </div>
          </div>
        ))}
      </div>
      {pager}
      {form && (
        <HookForm
          h={form === 'new' ? null : form}
          onClose={() => setForm(null)}
          onSaved={(secret) => {
            setForm(null);
            if (secret) setShown(secret);
            refresh();
          }}
        />
      )}
      {shown && (
        <SecretBox
          title="Webhook-ის ხელმოწერის გასაღები"
          value={shown}
          note="ამ გასაღებით შეამოწმე, რომ მოთხოვნა ჩვენგან მოდის: X-Loans-Signature = sha256=HMAC-SHA256(გასაღები, „X-Loans-Timestamp.სხეული“). მხოლოდ ახლა ჩანს."
          onClose={() => setShown(null)}
        />
      )}
    </>
  );
}

function HookForm({ h, onClose, onSaved }: { h: Hook | null; onClose: () => void; onSaved: (secret?: string) => void }) {
  const [url, setUrl] = useState(h?.Url ?? 'https://');
  const [events, setEvents] = useState<string[]>(h?.Events ?? EVENTS.map((e) => e[0]));
  const [error, setError] = useState('');
  const save = async () => {
    try {
      if (h) {
        await api('PUT', `/partner/webhook/edit/${h.ID}/${h.UID}`, { Url: url.trim(), Events: events });
        onSaved();
      } else onSaved((await api<Ref & { Secret: string }>('POST', '/partner/webhook/add', { Url: url.trim(), Events: events })).Secret);
    } catch (e) {
      setError(errText(e));
    }
  };
  return (
    <Modal title={h ? 'webhook-ის რედაქტირება' : 'ახალი webhook'} onClose={onClose}>
      <div className="form f main-form">
        <div className="fld">
          <label htmlFor="hUrl">მისამართი (https://)</label>
          <input id="hUrl" type="url" value={url} onChange={(e) => setUrl(e.target.value)} autoFocus />
        </div>
        <div className="fld">
          <label>მოვლენები</label>
          <div className="tpl rs">
            {EVENTS.map(([ev, label]) => (
              <label key={ev} className={events.includes(ev) ? 'on' : ''}>
                <input type="checkbox" checked={events.includes(ev)} onChange={(e) => setEvents(e.target.checked ? [...events, ev] : events.filter((x) => x !== ev))} />
                <i />
                <b>{label}</b>
              </label>
            ))}
          </div>
        </div>
        <ErrorLine error={error} />
        <div className="fbtns">
          <button type="button" className="btn btn-green" disabled={!events.length} onClick={save}>
            შენახვა
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            დახურვა
          </button>
        </div>
      </div>
    </Modal>
  );
}

const ST: Record<Delivery['Status'], [string, string]> = { ok: ['მიწოდებულია', 'var(--green)'], pending: ['მოლოდინში', 'var(--amber)'], failed: ['ვერ მიეწოდა', 'var(--red)'] };

function Deliveries() {
  const qc = useQueryClient();
  const toast = useToast();
  const [status, setStatus] = useState('');
  const q = useQuery({ queryKey: ['deliveries', status], queryFn: () => items<Delivery>('/partner/webhookDelivery/find/1/100', { Filter: status ? { Status: status } : {} }), refetchInterval: 10_000 });
  // the last 100 deliveries, paged here
  const { shown: pageRows, pager } = usePaged(q.data ?? [], [status]);
  return (
    <>
      <div className="top">
        <span />
        <select className="fsel" style={{ maxWidth: 200, justifySelf: 'end' }} aria-label="სტატუსი" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">ყველა</option>
          <option value="ok">მიწოდებული</option>
          <option value="pending">მოლოდინში</option>
          <option value="failed">ვერ მიეწოდა</option>
        </select>
      </div>
      <div className="list">
        {!q.data?.length && <div className="empty">{q.isLoading ? 'იტვირთება…' : 'მიწოდება ჯერ არ ყოფილა'}</div>}
        {pageRows.map((d) => (
          <div key={d.ID} className="card">
            <div className="prow wide">
              <span className="pinfo">
                <b>
                  {d.Event} · <span style={{ color: ST[d.Status][1] }}>{ST[d.Status][0]}</span>
                </b>
                <small style={{ wordBreak: 'break-all' }}>
                  {fmtDate(d.CreatedOn)} · {d.Endpoint.Url}
                </small>
                <small>
                  მცდელობა {d.Attempts}
                  {d.ResponseCode ? ` · პასუხი ${d.ResponseCode}` : ''}
                  {d.Error ? ` · ${d.Error}` : ''}
                  {d.Status === 'pending' && d.NextAttemptOn ? ` · შემდეგი ცდა ${fmtDate(d.NextAttemptOn)}` : ''}
                </small>
              </span>
              {d.Status !== 'ok' && (
                <span className="racts p">
                  <button
                    type="button"
                    className="btn btn-ghost sm"
                    onClick={async () => {
                      try {
                        await api('PUT', `/partner/webhookDelivery/redeliver/${d.ID}/${d.UID}`);
                        toast('ხელახლა გაიგზავნება');
                        qc.invalidateQueries({ queryKey: ['deliveries'] });
                      } catch (e) {
                        toast(errText(e));
                      }
                    }}
                  >
                    ხელახლა
                  </button>
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
      {pager}
    </>
  );
}
