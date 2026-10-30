import { FormEvent, useState } from 'react';
import { api, ApiError, Ref } from '../api/client';
import { useAuth } from '../auth/auth';
import { Logo, useTheme } from '../layout/shell';
import { Icon } from '../ui/icons';

/** Login: user (email or mobile) → one-time code (POST /public/auth/sendOtp → verifyOtp). */
export function LoginPage() {
  const { refresh } = useAuth();
  const [theme, toggleTheme] = useTheme();
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
      setChallenge(await api<Ref>('POST', '/public/auth/sendOtp', { Gateway: 'admin', Login: login }));
      setCode('');
    });
  };

  const verify = (e: FormEvent) => {
    e.preventDefault();
    if (!challenge) return;
    run(async () => {
      await api<Ref>('POST', '/public/auth/verifyOtp', { ID: challenge.ID, UID: challenge.UID, Otp: code });
      await refresh();
    });
  };

  const masked = login.includes('@') ? login : login.replace(/\D/g, '').replace(/^(\d{3})\d+(\d{2})$/, '$1 ** ** $2');

  return (
    <main className="login-page">
      <section className="login">
        {/* the logo and the theme switch sit in the dialog itself — no header on the login page */}
        <div className="login-top">
          <Logo className="logo" />
          <span className="tag">ადმინი</span>
          <span style={{ flex: 1 }} />
          <button type="button" className="ctl" title="თემა" aria-label="თემა" onClick={toggleTheme}>
            {theme === 'dark' ? <Icon.sun /> : <Icon.moon />}
          </button>
        </div>
        <h2>ადმინისტრაციული კონსოლი</h2>
        <p>{challenge ? `კოდი გაიგზავნა: ${masked}` : 'შეიყვანე ელ.ფოსტა ან მობილური — ერთჯერად კოდს გამოგიგზავნით'}</p>
        {!challenge ? (
          <form onSubmit={send}>
            <div className="f">
              <label htmlFor="lUser">მომხმარებელი</label>
              <input id="lUser" autoComplete="username" placeholder="მაგ. admin@loans.ge" value={login} onChange={(e) => setLogin(e.target.value)} autoFocus />
            </div>
            <button type="submit" className="btn btn-green full" disabled={busy || !login.trim()}>
              კოდის გაგზავნა
            </button>
          </form>
        ) : (
          <form onSubmit={verify}>
            <div className="f">
              <label htmlFor="lOtp">ერთჯერადი კოდი</label>
              <input id="lOtp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="••••" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} autoFocus />
            </div>
            <button type="submit" className="btn btn-green full" disabled={busy || code.length < 4}>
              შესვლა
            </button>
            <button type="button" className="btn btn-ghost full" style={{ marginTop: 8 }} onClick={() => (setChallenge(null), setError(''))}>
              სხვა მომხმარებელი
            </button>
          </form>
        )}
        {error && <div className="lerr">{error}</div>}
        <div className="demo-note">
          დემო: კოდი ჯერ API-ის ლოგში ჩანს (console SMS / ელ.ფოსტა). ანგარიშები: <code>admin@loans.ge</code> (სუპერადმინი), <code>operator@loans.ge</code> (ოპერატორი), <code>analyst@loans.ge</code> (ანალიტიკოსი).
        </div>
      </section>
    </main>
  );
}
