import { FormEvent, ReactNode, useEffect, useRef, useState } from 'react';
import { Link, Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { api, ApiError, Ref } from './api';
import logo from './logo.png';
import { AppsPage } from './pages/apps';
import { IntegrationPage } from './pages/integration';
import { MePage } from './pages/me';
import { OffersPage } from './pages/offers';
import { ProductFormPage, ProductsPage } from './pages/products';
import { CardsPage } from './pages/cards';
import { UsersPage } from './pages/users';
import { chime, useTitleCounter } from './attention';
import { Bell } from './bell';
import { useLiveEvents } from './live';
import { ROLES, useSession } from './session';
import { Modal, useToast } from './ui/ui';

// Partner cabinet (prototype partner.html): login → workspace. Every tab has its own address:
//   /applications (/applications/{id} — that record open) · /offers · /cards · /products (/products/{id}) · /users · /integration.
// Sales see applications only; the back-office addresses send them back there.

function useTheme(): [boolean, () => void, (d: boolean) => void] {
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
  return [dark, () => setDark((d) => !d), setDark];
}

export function App() {
  const { me, loading, logout } = useSession();
  const [dark, toggleTheme, setDark] = useTheme();
  // the folded menu, remembered
  const [small, setSmall] = useState(() => {
    try {
      return localStorage.getItem('partnerSb') === '1';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('partnerSb', small ? '1' : '0');
    } catch {
      /* storage blocked */
    }
  }, [small]);
  const [askOut, setAskOut] = useState(false);
  // no session (logged out, or it expired with the dialog open) — no logout dialog
  useEffect(() => {
    if (!me) setAskOut(false);
  }, [me]);
  const nav = useNavigate();
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
  // another organisation chosen → its applications (not on the first load — the address may point anywhere)
  const prevProfile = useRef<number | null>(null);
  useEffect(() => {
    if (prevProfile.current !== null && p && prevProfile.current !== p.ID) nav('/applications', { replace: true });
    prevProfile.current = p?.ID ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p?.ID]);
  if (loading) return null;
  const org = p?.Organization;

  const routes = p && (
    <Routes>
      <Route path="/applications" element={<AppsPage key={p.ID} />} />
      <Route path="/applications/:id" element={<AppsPage key={p.ID} />} />
      <Route path="/offers" element={back ? <OffersPage key={p.ID} /> : <Navigate to="/applications" replace />} />
      <Route path="/cards" element={back ? <CardsPage key={p.ID} /> : <Navigate to="/applications" replace />} />
      <Route path="/products" element={back ? <ProductsPage key={p.ID} /> : <Navigate to="/applications" replace />} />
      <Route path="/products/:id" element={back ? <ProductFormPage /> : <Navigate to="/applications" replace />} />
      <Route path="/users" element={back ? <UsersPage key={p.ID} /> : <Navigate to="/applications" replace />} />
      <Route path="/integration" element={back ? <IntegrationPage key={p.ID} /> : <Navigate to="/applications" replace />} />
      <Route path="/me" element={<MePage dark={dark} setDark={setDark} />} />
      <Route path="*" element={<Navigate to="/applications" replace />} />
    </Routes>
  );
  const themeBtn = (cls: string) => (
    <button type="button" className={cls} title="თემა" aria-label="თემა" onClick={toggleTheme}>
      {/* sun in dark, moon in light — the theme it switches to (as in admin) */}
      <svg viewBox="0 0 24 24">
        {dark ? (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </>
        ) : (
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        )}
      </svg>
    </button>
  );
  const logoLink = (cls: string) => (
    <Link className={cls} to="/applications" title="loans.ge">
      <img src={logo} alt="" />
      <b>
        Loans<span>.ge</span>
      </b>
    </Link>
  );

  // not signed in: the login dialog alone — the logo in the middle of it, the theme switch in the page's top-right corner
  if (!p)
    return (
      <main className="login-page">
        {themeBtn('ctl login-theme')}
        <Login
          top={
            <div className="login-top">
              {logoLink('logo')}
              <span className="tag">პარტნიორი</span>
            </div>
          }
        />
      </main>
    );

  // signed in: the menu on the left (as in admin) — logo and fold on top, the sections, the organisation / user / bell / theme / logout at the bottom
  return (
    <div className={`app${small ? ' sbc' : ''}`}>
      <aside className="sb">
        <div className="sb-head">
          {logoLink('sb-logo')}
          <button type="button" id="sbTg" title={small ? 'მენიუს გაშლა' : 'მენიუს შეკუმშვა'} aria-label={small ? 'მენიუს გაშლა' : 'მენიუს შეკუმშვა'} aria-expanded={!small} onClick={() => setSmall((v) => !v)}>
            <svg viewBox="0 0 24 24">
              <path d="M11 17l-5-5 5-5M18 17l-5-5 5-5" />
            </svg>
          </button>
        </div>
        <nav className="side" aria-label="განყოფილებები">
          {MENU.filter((m) => back || !m.back).map((m) => (
            <NavLink key={m.to} to={m.to} title={m.label} className={({ isActive }) => (isActive ? 'on' : '')}>
              <svg viewBox="0 0 24 24">
                <path d={m.icon} />
              </svg>
              <span className="lbl">{m.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sb-foot">
          {/* the user → my data (details, organisation, theme); the organisation's logo, the name, the role */}
          <NavLink to="/me" className={({ isActive }) => `who${isActive ? ' on' : ''}`} title={`${p.DisplayName} - ჩემი მონაცემები (${org?.NameKa ?? ''})`}>
            <span className="lg img">
              <img src={org?.LogoPath ? `/fs/${org.LogoPath}` : '/fs/default/org-logo.png'} alt="" />
            </span>
            <span className="lbl">
              <b>{p.DisplayName}</b>
              <small>{ROLES[p.Role]}</small>
            </span>
          </NavLink>
          <div className="sb-ctl">
            <Bell gateway="partner" onOpen={(n) => nav(n.ApplicationOrgID ? `/applications/${n.ApplicationOrgID}` : '/applications')} />
            <button type="button" className="ctl danger" title="გასვლა" aria-label="გასვლა" onClick={() => setAskOut(true)}>
              <svg viewBox="0 0 24 24">
                <path d="M10 17l5-5-5-5M15 12H3M21 3v18" />
              </svg>
            </button>
          </div>
        </div>
      </aside>
      <main className="col">
        <section className="ws">{routes}</section>
      </main>
      {askOut && (
        <Modal title="გასვლა" onClose={() => setAskOut(false)}>
          <p className="ask-text">მართლა გინდა გასვლა?</p>
          <div className="acts">
            <button
              type="button"
              className="btn btn-red"
              onClick={() => {
                setAskOut(false); // App stays mounted while logged out — the dialog must not wait for the next login
                void logout();
              }}
              autoFocus
            >
              გასვლა
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setAskOut(false)}>
              დახურვა
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/** The partner menu; sales see applications only. */
const MENU: { to: string; label: string; icon: string; back?: boolean }[] = [
  { to: '/applications', label: 'განაცხადები', icon: 'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h5' },
  { to: '/offers', label: 'შეთავაზებები', icon: 'M20 12v9H4v-9M2 7h20v5H2zM12 21V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z', back: true },
  { to: '/cards', label: 'ბარათები', icon: 'M8 3h11a2 2 0 0 1 2 2v11M4 7h11a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM8 12h5M8 16h5', back: true },
  { to: '/products', label: 'პროდუქტები', icon: 'M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8', back: true },
  { to: '/users', label: 'მომხმარებლები', icon: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8', back: true },
  { to: '/integration', label: 'ინტეგრაცია', icon: 'M9 2v6M15 2v6M6 8h12v4a6 6 0 0 1-12 0zM12 18v4', back: true },
];

/** Login: e-mail or mobile → one-time code (POST /public/auth/sendOtp → verifyOtp, gateway partner). */
function Login({ top }: { top: ReactNode }) {
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
      {top}
      <h2>პარტნიორის კაბინეტი</h2>
      <p>{challenge ? `კოდი გაიგზავნა: ${login}` : 'შეიყვანე ელ.ფოსტა - ერთჯერად კოდს გამოგიგზავნით'}</p>
      {!challenge ? (
        <form className="f" onSubmit={send}>
          <div className="fld">
            <label htmlFor="lUser">ელ.ფოსტა</label>
            <input id="lUser" type="email" inputMode="email" autoComplete="username" placeholder="მაგ. office@7.ge" value={login} onChange={(e) => setLogin(e.target.value)} autoFocus />
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
        დემო: <code>sales1@7.ge</code> (გაყიდვები, მისო A), <code>office@7.ge</code> (ბექ-ოფისი, მისო A), <code>sales2@7.ge</code> (გაყიდვები, შეზღუდული). კოდი - OTP კოდების გვერდზე (სატესტო გარემო).
      </div>
    </section>
  );
}
