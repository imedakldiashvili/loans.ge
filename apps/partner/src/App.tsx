import { FormEvent, useEffect, useState } from 'react';
import { api, ApiError, Ref } from './api';
import logo from './logo.png';
import { AppsPage } from './pages/apps';
import { ProductsPage } from './pages/products';
import { UsersPage } from './pages/users';
import { chime, useTitleCounter } from './attention';
import { useLiveEvents } from './live';
import { ROLES, useSession } from './session';
import { useToast } from './ui/ui';

// Partner cabinet (prototype partner.html): login → workspace with tabs for the back office
// (applications / products / users); sales see applications only.

const ORG_COLORS = ['#1e63b5', '#7b4fb5', '#0f9d8a', '#c0392b', '#b8860b', '#2e7d32'];

function useTheme(): [boolean, () => void] {
  const [dark, setDark] = useState(() => {
    try {
      return localStorage.getItem('theme') === 'dark';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    if (dark) document.documentElement.setAttribute('data-theme', 'dark');
    else document.documentElement.removeAttribute('data-theme');
    try {
      localStorage.setItem('theme', dark ? 'dark' : 'light');
    } catch {
      /* storage blocked */
    }
  }, [dark]);
  return [dark, () => setDark((d) => !d)];
}

export function App() {
  const { me, loading, logout, switchTo } = useSession();
  const [, toggleTheme] = useTheme();
  const [tab, setTab] = useState<'apps' | 'products' | 'users'>('apps');
  const p = me?.Profile;
  const back = p?.Role === 'back';
  const toast = useToast();
  const unseen = useTitleCounter();
  // new applications and customers' answers arrive live
  useLiveEvents(p ? `/partner/events/stream?p=${p.ID}` : null, [['apps'], ['app']], (e) => {
    if (e.Type === 'application.created') {
      toast('ახალი განაცხადი');
      chime();
      unseen();
    }
    else if (e.Actor === 'customer') toast('მომხმარებელმა განაცხადი განაახლა');
  });
  useEffect(() => {
    setTab('apps');
  }, [p?.ID]);
  if (loading) return null;
  const org = p?.Organization as (NonNullable<typeof p>['Organization'] & { Color?: string | null }) | undefined;

  return (
    <>
      <header>
        <div className="wrap nav">
          <a className="logo" href="/" title="loans.ge">
            <img src={logo} alt="" />
            <b>
              Loans<span>.ge</span>
            </b>
          </a>
          <span className="tag">პარტნიორი</span>
          {p && (
            <div className="who">
              <span className="lg" style={{ background: org?.Color || ORG_COLORS[(org?.ID ?? 0) % ORG_COLORS.length] }}>
                {org?.NameKa.split(' ').pop()}
              </span>
              <span>
                <b>{org?.NameKa}</b>
                <small>
                  {p.DisplayName} · {ROLES[p.Role]}
                </small>
              </span>
              {me!.Profiles.length > 1 && (
                <select aria-label="ორგანიზაცია" value={p.ID} onChange={(e) => switchTo(me!.Profiles.find((x) => x.ID === Number(e.target.value))!)}>
                  {me!.Profiles.map((x) => (
                    <option key={x.ID} value={x.ID}>
                      {x.Organization.NameKa}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}
          <button type="button" className="ctl" title="თემა" aria-label="თემა" onClick={toggleTheme}>
            <svg viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
            </svg>
          </button>
          {p && (
            <button type="button" className="ctl" title="გასვლა" aria-label="გასვლა" onClick={logout}>
              <svg viewBox="0 0 24 24">
                <path d="M10 17l5-5-5-5M15 12H3M21 3v18" />
              </svg>
            </button>
          )}
        </div>
      </header>
      <main className="wrap">
        {!p ? (
          <Login />
        ) : (
          <section className="ws">
            {back && (
              <nav className="tabs">
                {(['apps', 'products', 'users'] as const).map((t) => (
                  <button key={t} type="button" className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
                    {{ apps: 'განაცხადები', products: 'პროდუქტები', users: 'მომხმარებლები' }[t]}
                  </button>
                ))}
              </nav>
            )}
            {tab === 'apps' && <AppsPage key={p.ID} />}
            {tab === 'products' && back && <ProductsPage key={p.ID} />}
            {tab === 'users' && back && <UsersPage key={p.ID} />}
          </section>
        )}
      </main>
    </>
  );
}

/** Login: e-mail or mobile → one-time code (POST /public/auth/sendOtp → verifyOtp, gateway partner). */
function Login() {
  const { refresh } = useSession();
  const [login, setLogin] = useState('');
  const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState<Ref | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'შეცდომა');
    } finally {
      setBusy(false);
    }
  };
  const send = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      setChallenge(await api<Ref>('POST', '/public/auth/sendOtp', { Gateway: 'partner', Login: login }));
      setCode('');
    });
  };
  const verify = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      await api('POST', '/public/auth/verifyOtp', { ID: challenge!.ID, UID: challenge!.UID, Otp: code });
      await refresh();
    });
  };
  return (
    <section className="login">
      <h2>პარტნიორის კაბინეტი</h2>
      <p>{challenge ? `კოდი გაიგზავნა: ${login}` : 'შეიყვანე ელ.ფოსტა ან მობილური — ერთჯერად კოდს გამოგიგზავნით'}</p>
      {!challenge ? (
        <form className="f" onSubmit={send}>
          <div className="fld">
            <label htmlFor="lUser">მომხმარებელი</label>
            <input id="lUser" autoComplete="username" placeholder="მაგ. office@2.ge" value={login} onChange={(e) => setLogin(e.target.value)} autoFocus />
          </div>
          <button type="submit" className="btn btn-green full" disabled={busy || !login.trim()}>
            კოდის გაგზავნა
          </button>
        </form>
      ) : (
        <form className="f" onSubmit={verify}>
          <div className="fld">
            <label htmlFor="lOtp">ერთჯერადი კოდი</label>
            <input id="lOtp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="••••" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} autoFocus />
          </div>
          <button type="submit" className="btn btn-green full" disabled={busy || code.length < 4}>
            შესვლა
          </button>
          <button type="button" className="btn btn-ghost full" style={{ marginTop: 8 }} onClick={() => setChallenge(null)}>
            სხვა მომხმარებელი
          </button>
        </form>
      )}
      {error && <div className="lerr">{error}</div>}
      <div className="demo-note">
        დემო: <code>sales1@2.ge</code> (გაყიდვები, ბანკი B), <code>office@2.ge</code> (ბექ-ოფისი, ბანკი B), <code>sales2@2.ge</code> (გაყიდვები, შეზღუდული). კოდი — OTP კოდების გვერდზე (სატესტო გარემო).
      </div>
    </section>
  );
}
