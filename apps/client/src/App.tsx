import { ReactNode, useEffect, useRef, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAskLogin } from './auth';
import { Bell } from './bell';
import { Lang, n, t, useLang } from './i18n';
import { useLiveEvents } from './live';
import logo from './logo.png';
import { AppView, Cabinet } from './pages/cabinet';
import { Compare } from './pages/compare';
import { AboutPage, Home, PartnersPage, ProductPick, Start, TermsPage } from './pages/home';
import { Sent, Wizard } from './pages/wizard';
import { useRefs, useSession } from './session';
import { Modal } from './ui';

// Customer site (prototype loans-ge.html). Every part has its own address:
//   /                     home (?loan={productTypeId} preselects the loan)
//   /apply                the application wizard (started from the home page)
//   /cabinet              current applications · /cabinet/closed · /cabinet/profile
//   /cabinet/compare/{id}/{uid}   offers side by side
//   /cabinet/view/{id}/{uid}      the application in detail
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

function ViewPage() {
  const { id, uid } = useParams();
  const nav = useNavigate();
  return <AppView id={Number(id)} uid={uid ?? ''} onBack={() => nav('/cabinet')} />;
}

function ComparePage() {
  const { id, uid } = useParams();
  const nav = useNavigate();
  return <Compare id={Number(id)} uid={uid ?? ''} onBack={() => nav('/cabinet')} />;
}

function HomePage({ onStart, onNew }: { onStart: (s: Start) => void; onNew: (loan?: number) => void }) {
  const { search } = useLocation();
  const nav = useNavigate();
  const loan = Number(new URLSearchParams(search).get('loan')) || undefined;
  // /?loan=… (a footer link): the new-application dialog opens with that loan chosen
  useEffect(() => {
    if (!loan) return;
    onNew(loan);
    nav('/', { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loan]);
  return <Home onStart={onStart} onNew={() => onNew()} purpose={loan} />;
}

/** A header menu's open state: closes on a click outside its box or on Escape. */
function usePop() {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  return { open, setOpen, box };
}

/** The flags (inline: emoji flags do not show on Windows). */
const FLAGS: Record<Lang, ReactNode> = {
  ka: (
    <svg viewBox="0 0 30 20" aria-hidden="true">
      <rect width="30" height="20" fill="#fff" />
      <path d="M13 0h4v20h-4zM0 8h30v4H0z" fill="#e8112d" />
      <path d="M6 2.2h1v1.3h1.3v1H7v1.3H6V4.5H4.7v-1H6zM23 2.2h1v1.3h1.3v1H24v1.3h-1V4.5h-1.3v-1H23zM6 14.2h1v1.3h1.3v1H7v1.3H6v-1.3H4.7v-1H6zM23 14.2h1v1.3h1.3v1H24v1.3h-1v-1.3h-1.3v-1H23z" fill="#e8112d" />
    </svg>
  ),
  en: (
    <svg viewBox="0 0 60 30" aria-hidden="true">
      <clipPath id="ukc">
        <path d="M30 15h30v15zv15H0zH0V0zV0h30z" />
      </clipPath>
      <rect width="60" height="30" fill="#012169" />
      <path d="M0 0l60 30m0-30L0 30" stroke="#fff" strokeWidth="6" />
      <path d="M0 0l60 30m0-30L0 30" clipPath="url(#ukc)" stroke="#c8102e" strokeWidth="4" />
      <path d="M30 0v30M0 15h60" stroke="#fff" strokeWidth="10" />
      <path d="M30 0v30M0 15h60" stroke="#c8102e" strokeWidth="6" />
    </svg>
  ),
};
const LANGS: [Lang, string][] = [
  ['ka', 'ქართული'],
  ['en', 'English'],
];

/** The language: the current flag in the header, a menu of the languages under it. */
function LangMenu() {
  const { lang: cur, toggle } = useLang();
  const { open, setOpen, box } = usePop();
  return (
    <div className="langmenu" ref={box}>
      <button type="button" className="theme langbtn" aria-label="Language" title={LANGS.find(([k]) => k === cur)?.[1]} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <i className="flag">{FLAGS[cur]}</i>
      </button>
      {open && (
        <div className="um-pop lang-pop" role="menu">
          {LANGS.map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="menuitemradio"
              aria-checked={k === cur}
              className={k === cur ? 'on' : ''}
              onClick={() => {
                if (k !== cur) toggle();
                setOpen(false);
              }}
            >
              <i className="flag">{FLAGS[k]}</i>
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** The user icon once signed in: a menu under it — the name, the cabinet, the profile and logging out. */
function UserMenu({ name, onLogout }: { name: string; onLogout: () => void }) {
  const { open, setOpen, box } = usePop();
  const close = () => setOpen(false);
  return (
    <div className="usermenu" ref={box}>
      <button type="button" className="theme userbtn" aria-label={t('კაბინეტი')} title={name} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21a8 8 0 0 1 16 0" />
        </svg>
      </button>
      {open && (
        <div className="um-pop" role="menu">
          <div className="um-name">{name}</div>
          <Link role="menuitem" to="/cabinet" onClick={close}>
            {t('ჩემი განაცხადები')}
          </Link>
          <Link role="menuitem" to="/cabinet/profile" onClick={close}>
            {t('პროფილი')}
          </Link>
          <button
            type="button"
            role="menuitem"
            className="um-out"
            onClick={() => {
              close();
              onLogout();
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 17l5-5-5-5M15 12H3" />
              <path d="M14 4h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5" />
            </svg>
            {t('გასვლა')}
          </button>
        </div>
      )}
    </div>
  );
}

export function App() {
  const { me, loading, logout } = useSession();
  // partners' answers arrive live: the cabinet and the comparison reload when an event comes
  useLiveEvents(me ? '/client/events/stream' : null, [['apps'], ['app']]);
  const askLogin = useAskLogin();
  useLang(); // re-renders the whole site on a language change
  const { productTypes } = useRefs();
  const [, toggleTheme] = useTheme();
  const nav = useNavigate();
  const { pathname } = useLocation();
  const [start, setStart] = useState<Start | null>(null);
  const [sent, setSent] = useState<Sent | null>(null);
  // the new-application dialog (loan: preselected — a footer link /?loan=…)
  const [newApp, setNewApp] = useState<false | { loan?: number }>(false);

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
          <LangMenu />
          {!loading && !me && (
            // signing in: the user icon (as in the header once signed in), the words in the tooltip
            <a
              className="theme userbtn guest"
              href="/cabinet"
              aria-label={t('შესვლა')}
              title={t('შესვლა')}
              onClick={(e) => {
                e.preventDefault();
                void openCabinet();
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21a8 8 0 0 1 16 0" />
              </svg>
            </a>
          )}
          {me && (
            // signed in: the notifications and the user in one frame
            <div className="me-group">
              <Bell gateway="client" onOpen={() => nav('/cabinet')} />
              <UserMenu
                name={me.User.UserName || me.User.Email?.split('@')[0] || t('კაბინეტი')}
                onLogout={async () => {
                  // home first: logging out on a cabinet page would make it ask for a login (the PIN window) at once
                  nav('/');
                  await logout();
                }}
              />
            </div>
          )}
        </div>
      </header>

      <Routes>
        <Route path="/" element={<HomePage onStart={begin} onNew={(loan) => setNewApp({ loan })} />} />
        {/* the wizard starts from the home page (loan, amount, currency) — opened directly it goes back there */}
        <Route path="/apply" element={start ? <Wizard key={`${start.productType.ID}-${start.amount}`} start={start} onSent={setSent} /> : <Navigate to="/" replace />} />
        <Route path="/cabinet" element={<RequireLogin><Cabinet view="active" onNew={() => setNewApp({})} /></RequireLogin>} />
        <Route path="/cabinet/closed" element={<RequireLogin><Cabinet view="done" onNew={() => setNewApp({})} /></RequireLogin>} />
        <Route path="/cabinet/profile" element={<RequireLogin><Cabinet view="profile" onNew={() => setNewApp({})} /></RequireLogin>} />
        <Route path="/cabinet/compare/:id/:uid" element={<RequireLogin><ComparePage /></RequireLogin>} />
        <Route path="/cabinet/view/:id/:uid" element={<RequireLogin><ViewPage /></RequireLogin>} />
        <Route path="/partners" element={<PartnersPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {newApp && (
        <Modal onClose={() => setNewApp(false)} className="newapp-box" labelledBy="newAppTitle">
          <h3 id="newAppTitle">{t('აირჩიე პროდუქტი')}</h3>
          <ProductPick initial={newApp.loan} onPick={(productType) => begin({ productType, amount: 5000, currency: 'GEL' })} />
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
