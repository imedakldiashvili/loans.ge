import { StrictMode, useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import logo from './logo.png';
import './style.css';

// OTP viewer — TEST ENVIRONMENTS ONLY.
// Shows the one-time codes the API "sent" (console SMS / email), so testers can log in without reading the API log.
// The data comes from /dev/outbox, which exists only when the API runs with DEV_OUTBOX=true (never in production).

interface Message {
  ID: number;
  UID: string;
  Channel: 'sms' | 'email';
  Target: string;
  Purpose: string;
  Code: string;
  Text: string;
  CreatedOn: string;
  ExpiresOn: string;
  IsUsed: boolean;
  Attempts: number;
}
interface Envelope<T> {
  IsSuccess: boolean;
  Data: T;
  Error: { Code: string; Message: string } | null;
}

const GATEWAY: Record<string, string> = { admin: 'ადმინი', partner: 'პარტნიორი', client: 'მომხმარებელი' };
const pad = (n: number) => String(n).padStart(2, '0');
const clock = (t: string) => {
  const d = new Date(t);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};
const left = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
};

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const r = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const j = (await r.json().catch(() => null)) as Envelope<T> | null;
  if (!j?.IsSuccess) throw Object.assign(new Error(j?.Error?.Message ?? `HTTP ${r.status}`), { status: r.status });
  return j.Data;
}

function App() {
  const [items, setItems] = useState<Message[]>([]);
  const [search, setSearch] = useState('');
  const [state, setState] = useState<'loading' | 'ok' | 'off' | 'down'>('loading');
  const [copied, setCopied] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    try {
      const d = await call<{ Items: Message[] }>('POST', '/dev/outbox/find/1/50', { Filter: search ? { Search: search } : {} });
      setItems(d.Items);
      setState('ok');
    } catch (e) {
      // 404 = the API runs without DEV_OUTBOX; network error = the API is not running
      setState((e as { status?: number }).status === 404 ? 'off' : 'down');
    }
  }, [search]);

  useEffect(() => {
    load();
    const t = window.setInterval(load, 2000);
    return () => window.clearInterval(t);
  }, [load]);
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const copy = async (m: Message) => {
    try {
      await navigator.clipboard.writeText(m.Code);
      setCopied(m.ID);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard blocked — the code is visible anyway */
    }
  };
  const clear = async () => {
    if (!window.confirm('წავშალოთ ყველა კოდი სიიდან?')) return;
    await call('DELETE', '/dev/outbox/clear').catch(() => undefined);
    load();
  };

  return (
    <>
      <header>
        <div className="wrap nav">
          <span className="logo">
            <img src={logo} alt="" />
            <b>
              Loans<span>.ge</span>
            </b>
          </span>
          <span className="tag">OTP კოდები</span>
          <span className="env">სატესტო გარემო</span>
        </div>
      </header>
      <main className="wrap">
        <p className="warn">
          მხოლოდ სატესტო გარემოსთვის. აქ ჩანს ყველა ერთჯერადი კოდი, რომელიც სისტემამ „გაგზავნა" (SMS / ელ.ფოსტა ჯერ არ იგზავნება). რეალურ სერვერზე ეს გვერდი არ მუშაობს — API მას მხოლოდ <code>DEV_OUTBOX=true</code>-ით რთავს და არასდროს <code>NODE_ENV=production</code>-ზე.
        </p>
        <div className="bar">
          <input type="search" placeholder="ძებნა: ელ.ფოსტა ან მობილური" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
          <button type="button" className="btn ghost" onClick={clear} disabled={!items.length}>
            სიის გასუფთავება
          </button>
        </div>
        {state === 'off' && <div className="note">API გაშვებულია <code>DEV_OUTBOX</code>-ის გარეშე — კოდები არ ინახება. ჩართე <code>.env</code>-ში: <code>DEV_OUTBOX=true</code> და გადატვირთე API.</div>}
        {state === 'down' && <div className="note">API არ პასუხობს (http://localhost:4000). გაუშვი: <code>npm run dev:api</code></div>}
        {state === 'ok' && !items.length && <div className="note">კოდი ჯერ არ არის. მოითხოვე კოდი ადმინში, პარტნიორის კაბინეტში ან საიტზე — აქ 2 წამში გამოჩნდება.</div>}
        <div className="list">
          {items.map((m) => {
            const gw = m.Purpose.replace(/^login:/, '');
            const ms = new Date(m.ExpiresOn).getTime() - now;
            const status = m.IsUsed ? 'used' : ms <= 0 ? 'expired' : 'live';
            return (
              <div key={m.ID} className={`card ${status}`}>
                <button type="button" className="code" title="დააკოპირე" onClick={() => copy(m)}>
                  {m.Code}
                  <small>{copied === m.ID ? 'დაკოპირდა ✓' : 'დააკოპირე'}</small>
                </button>
                <div className="who">
                  <b>{m.Target}</b>
                  <span>
                    <span className={`ch ${m.Channel}`}>{m.Channel === 'sms' ? 'SMS' : 'EMAIL'}</span> · {GATEWAY[gw] ?? m.Purpose} · {clock(m.CreatedOn)}
                  </span>
                </div>
                <div className="state">
                  {status === 'used' && <span className="pill used">გამოყენებულია</span>}
                  {status === 'expired' && <span className="pill expired">ვადა გავიდა</span>}
                  {status === 'live' && <span className="pill live">მოქმედებს {left(ms)}</span>}
                  {m.Attempts > 0 && !m.IsUsed && <small>არასწორი ცდა: {m.Attempts}</small>}
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
