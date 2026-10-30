import { ReactNode, useEffect, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAskLogin } from './auth';
import { Bell } from './bell';
import { n, t, useLang } from './i18n';
import { useLiveEvents } from './live';
import logo from './logo.png';
import { Cabinet } from './pages/cabinet';
import { Compare } from './pages/compare';
import { AboutPage, Home, PartnersPage, QuickForm, Start, TermsPage } from './pages/home';
import { Sent, Wizard } from './pages/wizard';
import { useRefs, useSession } from './session';
import { Modal } from './ui';

// Customer site (prototype loans-ge.html). Every part has its own address:
//   /                     home (?loan={productTypeId} preselects the loan)
//   /apply                the application wizard (started from the home page)
//   /cabinet              current applications · /cabinet/closed · /cabinet/profile
//   /cabinet/compare/{id}/{uid}   offers side by side
//   /partners · /terms · /about
// The body class (in-wizard / in-cabinet / in-partners) drives the prototype CSS.

const bodyClass = (path: string) =>
  path.startsWith('/apply') ? 'in-wizard' : path.startsWith('/cabinet/compare') ? 'in-partners' : path.startsWith('/cabinet') ? 'in-cabinet' : ['/partners', '/terms', '/about'].includes(path) ? 'in-partners' : null;

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

/** The cabinet needs a login: asks for it, back to the home page if the dialog is closed. */
function RequireLogin({ children }: { children: ReactNode }) {
  const { me, loading } = useSession();
  const askLogin = useAskLogin();
  const nav = useNavigate();
  useEffect(() => {
    if (!loading && !me) void askLogin().then((ok) => !ok && nav('/', { replace: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, me]);
  return me ? <>{children}</> : null;
}

function ComparePage() {
  const { id, uid } = useParams();
  const nav = useNavigate();
  return <Compare id={Number(id)} uid={uid ?? ''} onBack={() => nav('/cabinet')} />;
}

function HomePage({ onStart }: { onStart: (s: Start) => void }) {
  const { search } = useLocation();
  const loan = Number(new URLSearchParams(search).get('loan')) || undefined;
  return <Home onStart={onStart} purpose={loan} />;
}

export function App() {
  const { me, loading, logout } = useSession();
  // partners' answers arrive live: the cabinet and the comparison reload when an event comes
  useLiveEvents(me ? '/client/events/stream' : null, [['apps'], ['app']]);
  const askLogin = useAskLogin();
  const { toggle: toggleLang } = useLang(); // re-renders the whole site on a language change
  const { productTypes } = useRefs();
  const [, toggleTheme] = useTheme();
  const nav = useNavigate();
  const { pathname } = useLocation();
  const [start, setStart] = useState<Start | null>(null);
  const [sent, setSent] = useState<Sent | null>(null);
  const [newApp, setNewApp] = useState(false);

  useEffect(() => {
    document.body.classList.remove('in-wizard', 'in-cabinet', 'in-partners');
    const c = bodyClass(pathname);
    if (c) document.body.classList.add(c);
    window.scrollTo({ top: 0 });
  }, [pathname]);

  const begin = (s: Start) => {
    setNewApp(false);
    setStart(s);
    nav('/apply');
  };
  const openCabinet = async () => {
    if (me || (await askLogin())) nav('/cabinet');
  };
  const toCabinet = () => {
    setSent(null);
    nav('/cabinet');
  };

  return (
    <>
      <header id="hdr">
        <div className="wrap nav">
          <Link className="logo" to="/">
            <img src={logo} alt="" width={40} height={37} />
            <b>
              Loans<span>.ge</span>
            </b>
          </Link>
          <button className="theme" type="button" aria-label={t('თემის გადართვა')} onClick={toggleTheme}>
            <svg className="sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
            </svg>
            <svg className="moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
            </svg>
          </button>
          <button className="lang" type="button" aria-label="Switch language" onClick={toggleLang}>
            <span>ქარ</span>
            <span>EN</span>
          </button>
          {!loading && !me && (
            <a
              className="btn btn-green login"
              href="/cabinet"
              onClick={(e) => {
                e.preventDefault();
                void openCabinet();
              }}
            >
              {t('შესვლა')}
            </a>
          )}
          {me && (
            <>
              <Bell gateway="client" onOpen={() => nav('/cabinet')} />
              <Link className="theme userbtn" to="/cabinet" aria-label={t('კაბინეტი')} title={me.User.UserName || me.User.Email?.split('@')[0] || t('კაბინეტი')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 21a8 8 0 0 1 16 0" />
                </svg>
              </Link>
              <button
                type="button"
                className="theme logout"
                aria-label={t('გასვლა')}
                title={t('გასვლა')}
                onClick={async () => {
                  // home first: logging out on a cabinet page would make it ask for a login (the PIN window) at once
                  nav('/');
                  await logout();
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 17l5-5-5-5M15 12H3" />
                  <path d="M14 4h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5" />
                </svg>
              </button>
            </>
          )}
        </div>
      </header>

      <Routes>
        <Route path="/" element={<HomePage onStart={begin} />} />
        {/* the wizard starts from the home page (loan, amount, currency) — opened directly it goes back there */}
        <Route path="/apply" element={start ? <Wizard key={`${start.productType.ID}-${start.amount}`} start={start} onSent={setSent} /> : <Navigate to="/" replace />} />
        <Route path="/cabinet" element={<RequireLogin><Cabinet view="active" onNew={() => setNewApp(true)} /></RequireLogin>} />
        <Route path="/cabinet/closed" element={<RequireLogin><Cabinet view="done" onNew={() => setNewApp(true)} /></RequireLogin>} />
        <Route path="/cabinet/profile" element={<RequireLogin><Cabinet view="profile" onNew={() => setNewApp(true)} /></RequireLogin>} />
        <Route path="/cabinet/compare/:id/:uid" element={<RequireLogin><ComparePage /></RequireLogin>} />
        <Route path="/partners" element={<PartnersPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {newApp && (
        <Modal onClose={() => setNewApp(false)} className="newapp-box" labelledBy="newAppTitle">
          <h3 id="newAppTitle">{t('ახალი განაცხადი')}</h3>
          <QuickForm onSubmit={begin} />
        </Modal>
      )}
      {sent && (
        <Modal onClose={toCabinet} noClose labelledBy="doneTitle">
          <div className="done-ico">✓</div>
          <h3 id="doneTitle">{t('განაცხადი გაიგზავნა')}</h3>
          <p className="done-sum">
            <b>{sent.amount}</b> · <span>{sent.loan}</span> · <b>{sent.orgs}</b> <span>{t('ორგანიზაცია')}</span>
          </p>
          <p>{t('შეთავაზებებს მიიღებ კაბინეტში - ორგანიზაციების პასუხები იქ გამოჩნდება.')}</p>
          <button type="button" className="btn btn-green full" onClick={toCabinet}>
            {t('კაბინეტში გადასვლა')}
          </button>
        </Modal>
      )}

      <footer>
        <div className="wrap">
          <div className="foot">
            <div className="foot-loans">
              <h4>{t('სესხები')}</h4>
              <ul>
                {productTypes.map((p) => (
                  <li key={p.ID}>
                    <Link to={`/?loan=${p.ID}`}>{n(p)}</Link>
                  </li>
                ))}
              </ul>
            </div>
            <div className="foot-contact">
              <h4>{t('დაგვიკავშირდით')}</h4>
              <div className="contact">
                <span>
                  <b>+995 599 919 444</b>
                </span>
                <span>
                  <b>info@loans.ge</b>
                </span>
              </div>
            </div>
          </div>
          <div className="foot-bottom">
            <Link className="logo" to="/">
              <img src={logo} alt="" width={40} height={37} />
              <b>
                Loans<span>.ge</span>
              </b>
            </Link>
            <nav className="foot-links">
              <Link to="/terms">{t('საიტის წესები')}</Link>
              <Link to="/about">{t('ჩვენს შესახებ')}</Link>
              <Link to="/partners">{t('პარტნიორები')}</Link>
            </nav>
            <span className="foot-copy">© 2026 loans.ge</span>
          </div>
        </div>
      </footer>
    </>
  );
}
