import { useQueries } from '@tanstack/react-query';
import { ReactNode, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { crud } from '../api/client';
import { ADMIN_ROLES, useAuth } from '../auth/auth';
import logo from '../assets/logo.png';
import { Icon } from '../ui/icons';
import { groupOf, MENU } from './menu';

const store = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* storage blocked */
    }
  },
};

/** Light by default, dark by the header switch (remembered). */
export function useTheme(): [string, () => void] {
  const [theme, setTheme] = useState(() => (store.get('adminTheme') === 'dark' ? 'dark' : 'light'));
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    store.set('adminTheme', theme);
  }, [theme]);
  return [theme, () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))];
}

export const Logo = ({ className }: { className: string }) => (
  <a className={className} href="/" title="loans.ge">
    <img src={logo} alt="" />
    <b>
      Loans<span>.ge</span>
    </b>
  </a>
);

/** Menu badges: TotalCount of each list (one small find per module, cached). */
function useMenuCounts() {
  const modules = MENU.flatMap((g) => g.items.map((i) => i.count).filter(Boolean)) as string[];
  const results = useQueries({
    queries: modules.map((m) => ({ queryKey: ['count', m], queryFn: () => crud.find(m, 1, 1), staleTime: 30_000 })),
  });
  return Object.fromEntries(modules.map((m, i) => [m, results[i].data?.TotalCount]));
}

export function Shell({ children }: { children: ReactNode }) {
  const { me, logout } = useAuth();
  const [theme, toggleTheme] = useTheme();
  const loc = useLocation();
  const nav = useNavigate();
  const [small, setSmall] = useState(() => store.get('adminSb') === '1');
  const active = groupOf(loc.pathname);
  const [open, setOpen] = useState<string | undefined>(active);
  const counts = useMenuCounts();

  useEffect(() => setOpen(active), [active]);
  useEffect(() => store.set('adminSb', small ? '1' : '0'), [small]);

  const name = me?.Profile?.DisplayName || me?.User.Email || '';
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2);

  return (
    <div className={`app in ${small ? 'sbc' : ''}`}>
      <aside className="sb">
        <Logo className="sb-logo" />
        <nav className="side" aria-label="განყოფილებები">
          {MENU.map((g) => {
            const isOpen = open === g.key;
            return (
              <div className="grpw" key={g.key}>
                <button
                  type="button"
                  className={`par ${active === g.key ? 'act' : ''} ${isOpen ? 'open' : ''}`}
                  aria-expanded={isOpen}
                  title={g.label}
                  onClick={() => {
                    // active group: fold / unfold; another group: open it with its first item
                    if (active === g.key && !small) setOpen(isOpen ? undefined : g.key);
                    else nav(g.items[0].path);
                  }}
                >
                  <g.icon />
                  <span className="lbl">{g.label}</span>
                  <Icon.chev />
                </button>
                <div className="sub" hidden={!isOpen}>
                  {g.items.map((it) => (
                    <button key={it.path} type="button" className={loc.pathname === it.path || loc.pathname.startsWith(it.path + '/') ? 'on' : ''} onClick={() => nav(it.path)}>
                      {it.icon && <it.icon />}
                      <span className="lbl">{it.label}</span>
                      {it.count && counts[it.count] !== undefined && <span className="n">{counts[it.count]}</span>}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>
      </aside>
      <div className="col">
        <header>
          <div className="wrap nav">
            <Logo className="logo" />
            <button type="button" className="ctl" title="მენიუს შეკუმშვა" aria-label="მენიუს შეკუმშვა" onClick={() => setSmall((s) => !s)}>
              <Icon.collapse />
            </button>
            <span className="tag">ადმინი</span>
            <div className="who">
              <span className="lg">{initials}</span>
              <span>
                <b>{name}</b>
                <small>{me?.Profile ? ADMIN_ROLES[me.Profile.Role] : ''}</small>
              </span>
            </div>
            <button type="button" className="ctl" title="თემა" aria-label="თემა" onClick={toggleTheme}>
              {theme === 'dark' ? <Icon.sun /> : <Icon.moon />}
            </button>
            <button type="button" className="ctl danger" title="გასვლა" aria-label="გასვლა" onClick={logout}>
              <Icon.logout />
            </button>
          </div>
        </header>
        <main className="wrap">
          <section className="ws">
            <div className="main">{children}</div>
          </section>
        </main>
      </div>
    </div>
  );
}
