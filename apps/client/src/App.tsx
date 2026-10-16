import { useEffect, useState } from 'react';
import { useAskLogin } from './auth';
import logo from './logo.png';
import { App as Application, Cabinet } from './pages/cabinet';
import { Compare } from './pages/compare';
import { AboutPage, Home, PartnersPage, QuickForm, Start, TermsPage } from './pages/home';
import { Sent, Wizard } from './pages/wizard';
import { useRefs, useSession } from './session';
import { Modal } from './ui';

// Customer site (prototype loans-ge.html): home → wizard → cabinet; compare, partners, terms, about.
// One page app; the body class (in-wizard / in-cabinet / in-partners) drives the prototype CSS.

type View = 'home' | 'wizard' | 'cabinet' | 'compare' | 'partners' | 'terms' | 'about';
const BODY: Partial<Record<View, string>> = { wizard: 'in-wizard', cabinet: 'in-cabinet', compare: 'in-partners', partners: 'in-partners', terms: 'in-partners', about: 'in-partners' };

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
  const { me, loading, logout } = useSession();
  const askLogin = useAskLogin();
  const { productTypes } = useRefs();
  const [, toggleTheme] = useTheme();
  const [view, setView] = useState<View>('home');
  const [start, setStart] = useState<Start | null>(null);
  const [compare, setCompare] = useState<Application | null>(null);
  const [sent, setSent] = useState<Sent | null>(null);
  const [newApp, setNewApp] = useState(false);
  const [purpose, setPurpose] = useState<number | undefined>();

  useEffect(() => {
    document.body.classList.remove('in-wizard', 'in-cabinet', 'in-partners');
    const c = BODY[view];
    if (c) document.body.classList.add(c);
    window.scrollTo({ top: 0 });
  }, [view]);
  // logged out while in the cabinet → home
  useEffect(() => {
    if (!loading && !me && (view === 'cabinet' || view === 'compare')) setView('home');
  }, [me, loading, view]);

  const begin = (s: Start) => {
    setNewApp(false);
    setStart(s);
    setView('wizard');
  };
  const openCabinet = async () => {
    if (me || (await askLogin())) setView('cabinet');
  };
  const home = (e?: { preventDefault: () => void }) => {
    e?.preventDefault();
    setView('home');
  };

  return (
    <>
      <header id="hdr">
        <div className="wrap nav">
          <a className="logo" href="#" onClick={home}>
            <img src={logo} alt="" width={40} height={37} />
            <b>
              Loans<span>.ge</span>
            </b>
          </a>
          <button className="theme" type="button" aria-label="თემის გადართვა" onClick={toggleTheme}>
            <svg className="sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
            </svg>
            <svg className="moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
            </svg>
          </button>
          {!loading && !me && (
            <a
              className="btn btn-green login"
              href="#"
              onClick={(e) => {
                e.preventDefault();
                openCabinet();
              }}
            >
              შესვლა
            </a>
          )}
          {me && (
            <>
              <button type="button" className="theme userbtn" aria-label="კაბინეტი" title={me.User.UserName || me.User.Email?.split('@')[0] || 'კაბინეტი'} onClick={() => setView('cabinet')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 21a8 8 0 0 1 16 0" />
                </svg>
              </button>
              <button
                type="button"
                className="theme logout"
                aria-label="გასვლა"
                title="გასვლა"
                onClick={async () => {
                  await logout();
                  setView('home');
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

      {view === 'home' && <Home onStart={begin} purpose={purpose} />}
      {view === 'wizard' && start && <Wizard key={`${start.productType.ID}-${start.amount}`} start={start} onClose={() => setView('home')} onSent={setSent} />}
      {view === 'cabinet' && me && <Cabinet onNew={() => setNewApp(true)} onCompare={(a) => (setCompare(a), setView('compare'))} />}
      {view === 'compare' && compare && <Compare app={compare} onBack={() => setView('cabinet')} />}
      {view === 'partners' && <PartnersPage />}
      {view === 'terms' && <TermsPage />}
      {view === 'about' && <AboutPage />}

      {newApp && (
        <Modal onClose={() => setNewApp(false)} className="newapp-box" labelledBy="newAppTitle">
          <h3 id="newAppTitle">ახალი განაცხადი</h3>
          <QuickForm onSubmit={begin} />
        </Modal>
      )}
      {sent && (
        <Modal onClose={() => (setSent(null), setView('cabinet'))} noClose labelledBy="doneTitle">
          <div className="done-ico">✓</div>
          <h3 id="doneTitle">განაცხადი გაიგზავნა</h3>
          <p className="done-sum">
            <b>{sent.amount}</b> · <span>{sent.loan}</span> · <b>{sent.orgs}</b> <span>ორგანიზაცია</span>
          </p>
          <p>შეთავაზებებს მიიღებ კაბინეტში — ორგანიზაციების პასუხები იქ გამოჩნდება.</p>
          <button type="button" className="btn btn-green full" onClick={() => (setSent(null), setView('cabinet'))}>
            კაბინეტში გადასვლა
          </button>
        </Modal>
      )}

      <footer>
        <div className="wrap">
          <div className="foot">
            <div className="foot-loans">
              <h4>სესხები</h4>
              <ul>
                {productTypes.map((p) => (
                  <li key={p.ID}>
                    <a
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        setPurpose(p.ID);
                        setView('home');
                      }}
                    >
                      {p.NameKa}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
            <div className="foot-contact">
              <h4>დაგვიკავშირდით</h4>
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
            <a className="logo" href="#" onClick={home}>
              <img src={logo} alt="" width={40} height={37} />
              <b>
                Loans<span>.ge</span>
              </b>
            </a>
            <nav className="foot-links">
              {(
                [
                  ['terms', 'საიტის წესები'],
                  ['about', 'ჩვენს შესახებ'],
                  ['partners', 'პარტნიორები'],
                ] as const
              ).map(([v, label]) => (
                <a
                  key={v}
                  href={`#${v}`}
                  onClick={(e) => {
                    e.preventDefault();
                    setView(v);
                  }}
                >
                  {label}
                </a>
              ))}
            </nav>
            <span className="foot-copy">© 2026 loans.ge</span>
          </div>
        </div>
      </footer>
    </>
  );
}
