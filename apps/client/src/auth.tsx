import { t, useLang } from './i18n';
import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api, ApiError, Ref } from './api';
import { useSession } from './session';
import { ErrorText, Modal, PinPad, pinProblem, toast } from './ui';

// Login / registration (prototype loginModal + otpModal): e-mail → one-time code → session.
// The first login creates the account (client gateway). Google / Facebook come with OAuth (later stage).

const RESEND = 60;

/** One-time code dialog: timer, resend, confirm. `send` (re)sends the code, `verify` checks it. */
export function OtpModal({ where, target, send, verify, onClose }: { where: string; target: string; send: () => Promise<Ref>; verify: (ref: Ref, code: string) => Promise<void>; onClose: () => void }) {
  const [ref, setRef] = useState<(Ref & { Length?: number }) | null>(null);
  const [code, setCode] = useState('');
  const [left, setLeft] = useState(RESEND);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  const doSend = useCallback(async () => {
    setError('');
    setCode('');
    try {
      setRef(await send());
      setLeft(RESEND);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('კოდის გაგზავნა ვერ მოხერხდა'));
      setLeft(0);
    }
  }, [send]);
  useEffect(() => {
    if (started.current) return; // StrictMode runs effects twice — send once
    started.current = true;
    doSend();
  }, [doSend]);
  useEffect(() => {
    if (left <= 0) return;
    const t = window.setTimeout(() => setLeft(left - 1), 1000);
    return () => window.clearTimeout(t);
  }, [left]);

  // the code's length (OTP settings); the last digit confirms by itself
  const len = ref?.Length ?? 4;
  const confirm = async () => {
    if (!ref || busy || code.length !== len) return;
    setBusy(true);
    setError('');
    try {
      await verify(ref, code);
    } catch (e) {
      setError(e instanceof ApiError ? [e.message, ...e.details.filter((d) => d.Field !== 'Otp').map((d) => d.Message)].join(' - ') : t('შეცდომა'));
      setCode('');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal onClose={onClose} labelledBy="otpTitle">
      <h3 id="otpTitle">{t('შეიყვანე OTP კოდი')}</h3>
      <p>
        <span>{where}</span> <b>{target}</b>
      </p>
      {/* the same keypad as the PIN */}
      <div className="pin-form">
        <PinPad value={code} onChange={setCode} length={len} digits label={t('OTP კოდი')} onEnter={() => void confirm()} />
      </div>
      {/* one fixed place for the error / "checking…" (the dialog does not grow) */}
      <p className={`pin-msg${error ? ' err' : ''}`} role={error ? 'alert' : undefined}>
        {error || (busy ? t('მოწმდება…') : '')}
      </p>
      <div className="otp-again">
        {left > 0 ? (
          <span className="otp-timer">
            {t('ახალი კოდი')} 0{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
          </span>
        ) : (
          <button type="button" className="linkbtn" onClick={doSend}>
            {t('კოდის თავიდან გაგზავნა')}
          </button>
        )}
      </div>
    </Modal>
  );
}

/** Asks for login and resolves true once the session is open (false when the dialog is closed). */
/** The PIN symbol: a small keypad. */
export const PinIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="pin-icon">
    {[5, 12, 19].flatMap((y) => [5, 12, 19].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="2.2" />))}
  </svg>
);

/**
 * Set / change the site PIN on the keypad, step by step — a full entry moves on by itself:
 *   changing it: the current PIN (checked) → the new one → again;  setting it: the new one → again.
 * An error shows in a toast and the step stays. A first PIN outside a fresh code session is confirmed with a code.
 */
export function PinModal({ isSet, fresh = false, title, intro, onClose, onDone, onLater }: {
  isSet: boolean;
  /** the session was just opened with a code — no second code, no current PIN */
  fresh?: boolean;
  title?: string;
  intro?: string;
  onClose: () => void;
  onDone: () => void;
  /** closing = "later" (the offer after signing in) */
  onLater?: () => void;
}) {
  const changing = isSet && !fresh;
  const [step, setStep] = useState<'current' | 'new' | 'again'>(changing ? 'current' : 'new');
  const [cur, setCur] = useState('');
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [code, setCode] = useState(false);
  const [busy, setBusy] = useState(false);
  // how many digits: a new PIN (admin → settings → PIN), the current one (the user's own)
  const [len, setLen] = useState(4);
  const [curLen, setCurLen] = useState(4);
  useEffect(() => {
    void api<{ Length: number; CurrentLength: number | null }>('GET', '/client/pin/status')
      .then((s) => {
        setLen(s.Length || 4);
        setCurLen(s.CurrentLength || 4);
      })
      .catch(() => undefined);
  }, []);
  const fail = (e: unknown) => toast(e instanceof ApiError ? e.message : t('შეცდომა'));

  // step one (changing): the current PIN — on only when it is right
  const checkCurrent = async () => {
    if (cur.length !== curLen || busy) return;
    setBusy(true);
    try {
      await api('POST', '/client/pin/check', { CurrentPin: cur });
      setStep('new');
    } catch (e) {
      fail(e);
      setCur('');
    } finally {
      setBusy(false);
    }
  };
  // the new PIN — a weak one stays (with its reason)
  const first = () => {
    if (a.length !== len) return;
    const problem = pinProblem(a, len);
    if (problem) {
      toast(t(problem));
      setA('');
      return;
    }
    setStep('again');
  };
  // again — the same → saved; different → asked again
  const save = async () => {
    if (b.length !== len || busy) return;
    if (a !== b) {
      toast(t('PIN-ები არ ემთხვევა - გაიმეორე'));
      setB('');
      return;
    }
    if (!changing && !fresh) return setCode(true);
    setBusy(true);
    try {
      await api('PUT', '/client/pin/set', changing ? { Pin: a, CurrentPin: cur } : { Pin: a });
      onDone();
    } catch (e) {
      // the fresh window is over — confirm with a code after all
      if (!changing && e instanceof ApiError && e.status === 400 && e.details.some((d) => d.Field === 'Otp')) setCode(true);
      else {
        fail(e);
        setB('');
      }
    } finally {
      setBusy(false);
    }
  };
  if (code)
    return (
      <OtpModal
        where="კოდი გაიგზავნა"
        target=""
        send={() => api<Ref>('POST', '/client/pin/sendOtp')}
        verify={async (ref, otp) => {
          await api('PUT', '/client/pin/set', { Pin: a, Otp: { ID: ref.ID, UID: ref.UID, Code: otp } });
          onDone();
        }}
        onClose={onClose}
      />
    );
  const label = step === 'current' ? 'მიმდინარე PIN' : step === 'new' ? 'ახალი PIN' : 'გაიმეორე PIN';
  return (
    <Modal onClose={onLater ?? onClose} labelledBy="pinSetTitle" className="pin-box">
      <h3 id="pinSetTitle">{t(title ?? (isSet ? 'PIN-ის შეცვლა' : 'PIN-ის დაყენება'))}</h3>
      <p>{t(intro ?? 'PIN-ით შეხვალ ელ. ფოსტით, კოდის გარეშე.')}</p>
      <div className="pin-form">
        <b className="pin-step">{t(label)}</b>
        {step === 'current' && <PinPad key="current" value={cur} onChange={setCur} length={curLen} label={t(label)} onEnter={() => void checkCurrent()} />}
        {step === 'new' && <PinPad key="new" value={a} onChange={setA} length={len} label={t(label)} onEnter={first} />}
        {step === 'again' && <PinPad key="again" value={b} onChange={setB} length={len} label={t(label)} onEnter={() => void save()} />}
      </div>
      {/* errors go to a toast; this fixed line only says "checking…" (the dialog does not grow) */}
      <p className="pin-msg">{busy ? t('მოწმდება…') : ''}</p>
    </Modal>
  );
}

/** The e-mail of an account that signs in with a PIN, remembered on this device (storage may be off — then nothing is remembered). */
const REMEMBER = 'lg.pinLogin';
const remembered = () => {
  try {
    return localStorage.getItem(REMEMBER) ?? '';
  } catch {
    return '';
  }
};
const remember = (email: string | null) => {
  try {
    if (email) localStorage.setItem(REMEMBER, email);
    else localStorage.removeItem(REMEMBER);
  } catch {
    /* storage unavailable */
  }
};

const Ctx = createContext<() => Promise<boolean>>(async () => false);
export const useAskLogin = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { refresh } = useSession();
  useLang(); // dialogs follow the language switch
  const [step, setStep] = useState<'email' | 'otp' | 'pin' | 'setpin' | null>(null);
  // the account already had a PIN (the form after the code replaces it)
  const [hadPin, setHadPin] = useState(false);

  const [email, setEmail] = useState('');
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const ask = useCallback(() => {
    resolver.current?.(false);
    // a remembered PIN account: straight to the PIN field (if it still has a PIN)
    const known = remembered();
    setCodeOnly(false);
    setEmail(known);
    setPin('');
    setPinError('');
    setStep(known ? 'pin' : 'email');
    if (known)
      void api<{ Pin: boolean; Length: number | null }>('POST', '/public/auth/loginMethod', { Login: known })
        .then((m) => {
          if (m.Length) setPinLen(m.Length);
          if (!m.Pin) {
            remember(null);
            setStep((s) => (s === 'pin' ? 'email' : s));
          }
        })
        .catch(() => undefined);
    return new Promise<boolean>((res) => (resolver.current = res));
  }, []);
  const finish = (ok: boolean) => {
    setStep(null);
    resolver.current?.(ok);
    resolver.current = null;
  };
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  // e-mail first: an account with a PIN gets the PIN field, the others the one-time code
  const [checking, setChecking] = useState(false);
  // "another e-mail" was chosen — that one signs in with the code only
  const [codeOnly, setCodeOnly] = useState(false);
  const next = async () => {
    if (!valid || checking) return;
    if (codeOnly) return setStep('otp');
    setChecking(true);
    try {
      const m = await api<{ Pin: boolean; Length: number | null }>('POST', '/public/auth/loginMethod', { Login: email.trim() });
      if (m.Pin) {
        setPinLen(m.Length ?? 4);
        setPin('');
        setPinError('');
        setStep('pin');
      } else setStep('otp');
    } catch {
      setStep('otp');
    } finally {
      setChecking(false);
    }
  };
  // the site PIN (set in the profile): PIN only — the e-mail is the one typed above
  const [pin, setPin] = useState('');
  const [pinLen, setPinLen] = useState(4);
  const [pinBusy, setPinBusy] = useState(false);
  const [pinError, setPinError] = useState('');
  const pinReady = pin.length === pinLen;
  const pinSignIn = async () => {
    if (!pinReady || pinBusy) return;
    setPinBusy(true);
    setPinError('');
    try {
      await api('POST', '/public/auth/pinLogin', { Login: email.trim(), Pin: pin });
      remember(email.trim().toLowerCase());
      await refresh();
      finish(true);
    } catch (e) {
      setPinError(e instanceof ApiError ? e.message : t('შეცდომა'));
      setPin('');
    } finally {
      setPinBusy(false);
    }
  };
  const send = useCallback(() => api<Ref>('POST', '/public/auth/sendOtp', { Gateway: 'client', Login: email.trim() }), [email]);

  return (
    <Ctx.Provider value={ask}>
      {children}
      {step === 'email' && (
        <Modal onClose={() => finish(false)} labelledBy="loginTitle">
          <h3 id="loginTitle">{t('ავტორიზაცია')}</h3>
          <div className="social">
            <button type="button" className="btn btn-social" disabled title={t('მალე')}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.4z" />
                <path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z" />
                <path fill="#FBBC05" d="M6.4 14a6 6 0 0 1 0-3.9V7.5H3.1a10 10 0 0 0 0 9l3.3-2.5z" />
                <path fill="#EA4335" d="M12 6c1.5 0 2.8.5 3.8 1.5l2.8-2.8A10 10 0 0 0 3.1 7.5L6.4 10C7.2 7.8 9.4 6 12 6z" />
              </svg>
              Google
            </button>
            <button type="button" className="btn btn-social" disabled title={t('მალე')}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#1877F2" d="M24 12a12 12 0 1 0-13.9 11.9v-8.4H7.1V12h3V9.4c0-3 1.8-4.7 4.5-4.7 1.3 0 2.7.2 2.7.2v3h-1.5c-1.5 0-2 .9-2 1.9V12h3.3l-.5 3.5h-2.8v8.4A12 12 0 0 0 24 12z" />
              </svg>
              Facebook
            </button>
          </div>
          <div className="or">
            <span>{t('ან')}</span>
          </div>
          <p>
            {t('შეიყვანე ელ. ფოსტა')}
            <br />
            {t('შეხვალ PIN-ით ან ერთჯერადი კოდით')}
          </p>
          <input
            type="email"
            placeholder="name@example.com"
            autoComplete="email"
            aria-label={t('ელ. ფოსტა')}
            className="login-email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void next()}
            autoFocus
          />
          <button type="button" className="btn btn-green full" disabled={!valid || checking} onClick={() => void next()}>
            {t('გაგრძელება')}
          </button>
        </Modal>
      )}
      {step === 'pin' && (
        <Modal onClose={() => finish(false)} labelledBy="pinTitle">
          <h3 id="pinTitle">{t('ავტორიზაცია')}</h3>
          <p>
            <b className="pin-who">{email.trim().toLowerCase()}</b>
            <br />
            {t('შეიყვანე PIN-კოდი')}
          </p>
          <div className="pin-form">
            <PinPad value={pin} onChange={setPin} length={pinLen} label="PIN" onEnter={() => void pinSignIn()} />
          </div>
          {/* one fixed line for the error / "checking…" — the dialog does not grow when it shows */}
          <p className={`pin-msg${pinError ? ' err' : ''}`} role={pinError ? 'alert' : undefined}>
            {pinError || (pinBusy ? t('მოწმდება…') : '')}
          </p>
          <div className="pin-links">
            {/* forgot the PIN: a one-time code to the same e-mail (a new PIN is set in the profile) */}
            <button type="button" className="linkbtn" onClick={() => setStep('otp')}>
              {t('PIN დაგავიწყდა?')}
            </button>
            <button
              type="button"
              className="linkbtn"
              onClick={() => {
                // not me — forget the remembered e-mail on this device; the other e-mail signs in with a code
                remember(null);
                setEmail('');
                setCodeOnly(true);
                setStep('email');
              }}
            >
              {t('სხვა მომხმარებლით')}
            </button>
          </div>
        </Modal>
      )}
      {step === 'setpin' && (
        <PinModal
          isSet={hadPin}
          fresh
          title={hadPin ? 'ახალი PIN' : 'PIN-ის დაყენება'}
          intro={hadPin ? 'შეიყვანე ახალი PIN-კოდი - ძველი ჩანაცვლდება.' : 'შემდეგ ჯერზე შეხვალ ელ. ფოსტით და PIN-ით, კოდის გარეშე.'}
          onClose={() => finish(true)}
          onDone={() => (remember(email.trim().toLowerCase()), finish(true))}
          onLater={() => finish(true)}
        />
      )}
      {step === 'otp' && (
        <OtpModal
          where="კოდი გაიგზავნა ელ. ფოსტაზე"
          target={email.trim().toLowerCase()}
          send={send}
          verify={async (ref, code) => {
            await api('POST', '/public/auth/verifyOtp', { ID: ref.ID, UID: ref.UID, Otp: code });
            await refresh();
            // after the code: the PIN form, while the code session is fresh — a first PIN, or a new one (forgot it)
            const st = await api<{ IsSet: boolean }>('GET', '/client/pin/status').catch(() => null);
            if (st) {
              setHadPin(st.IsSet);
              setStep('setpin');
            } else finish(true);
          }}
          onClose={() => finish(false)}
        />
      )}
    </Ctx.Provider>
  );
}
