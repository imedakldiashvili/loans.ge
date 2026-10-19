import { t, useLang } from './i18n';
import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api, ApiError, Ref } from './api';
import { useSession } from './session';
import { ErrorText, Modal, PinInput, pinProblem } from './ui';

// Login / registration (prototype loginModal + otpModal): e-mail → one-time code → session.
// The first login creates the account (client gateway). Google / Facebook come with OAuth (later stage).

const RESEND = 60;

/** One-time code dialog: timer, resend, confirm. `send` (re)sends the code, `verify` checks it. */
export function OtpModal({ where, target, send, verify, onClose }: { where: string; target: string; send: () => Promise<Ref>; verify: (ref: Ref, code: string) => Promise<void>; onClose: () => void }) {
  const [ref, setRef] = useState<Ref | null>(null);
  const [code, setCode] = useState('');
  const [left, setLeft] = useState(RESEND);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
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
    input.current?.focus();
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

  const confirm = async () => {
    if (!ref) return;
    setBusy(true);
    setError('');
    try {
      await verify(ref, code);
    } catch (e) {
      setError(e instanceof ApiError ? [e.message, ...e.details.filter((d) => d.Field !== 'Otp').map((d) => d.Message)].join(' — ') : t('შეცდომა'));
    } finally {
      setBusy(false);
    }
  };
  const ok = /^\d{4,6}$/.test(code) && !!ref;
  return (
    <Modal onClose={onClose} labelledBy="otpTitle">
      <h3 id="otpTitle">{t('შეიყვანე OTP კოდი')}</h3>
      <p>
        <span>{where}</span> <b>{target}</b>
      </p>
      <div className="otp-row">
        <input
          ref={input}
          id="otp"
          type="text"
          inputMode="numeric"
          maxLength={6}
          placeholder="••••"
          autoComplete="one-time-code"
          aria-label={t('OTP კოდი')}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          onKeyDown={(e) => e.key === 'Enter' && ok && !busy && confirm()}
          autoFocus
        />
        {left > 0 ? (
          <span className="otp-timer">
            0{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
          </span>
        ) : (
          <button type="button" className="otp-resend" onClick={doSend}>
            {t('თავიდან')}
            <br />
            {t('გაგზავნა')}
          </button>
        )}
      </div>
      <button type="button" className="btn btn-green full" disabled={!ok || busy} onClick={confirm}>
        {t('დადასტურება')}
      </button>
      <ErrorText error={error} />
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
 * Set / change / remove the site PIN: the PIN twice, then (unless the session was just opened with a code) the code
 * sent to the account's e-mail. After a code sign-in it is offered right away ("later" — skip).
 */
export function PinModal({ isSet, fresh = false, title, intro, onClose, onDone, onLater }: {
  isSet: boolean;
  /** the session was just opened with a code — no second code */
  fresh?: boolean;
  title?: string;
  intro?: string;
  onClose: () => void;
  onDone: () => void;
  /** "later" instead of closing (the offer after signing in) */
  onLater?: () => void;
}) {
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [error, setError] = useState('');
  const [code, setCode] = useState(false);
  const [busy, setBusy] = useState(false);
  const problem = a ? pinProblem(a) : '';
  const ready = !problem && a.length >= 4 && a === b;
  const say = (e: unknown) => setError(e instanceof ApiError ? [e.message, ...e.details.map((d) => d.Message)].join(' — ') : t('შეცდომა'));
  const save = async () => {
    if (!ready || busy) return;
    if (!fresh) return setCode(true);
    setBusy(true);
    setError('');
    try {
      await api('PUT', '/client/pin/set', { Pin: a });
      onDone();
    } catch (e) {
      // the fresh window is over — confirm with a code after all
      if (e instanceof ApiError && e.status === 400 && e.details.some((d) => d.Field === 'Otp')) setCode(true);
      else say(e);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!confirm(t('წავშალოთ PIN-კოდი?'))) return;
    setBusy(true);
    try {
      await api('PUT', '/client/pin/remove');
      onDone();
    } catch (e) {
      say(e);
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
  return (
    <Modal onClose={onLater ?? onClose} labelledBy="pinSetTitle" className="pin-box">
      <h3 id="pinSetTitle">{t(title ?? (isSet ? 'PIN-ის შეცვლა' : 'PIN-ის დაყენება'))}</h3>
      <p>{t(intro ?? 'PIN-ით შეხვალ ელ. ფოსტით ან მობილურით, კოდის გარეშე. 4–6 ციფრი.')}</p>
      <div className="pin-form">
        <label>
          {t('ახალი PIN')}
          <PinInput value={a} onChange={setA} label={t('ახალი PIN')} autoFocus />
        </label>
        <label>
          {t('გაიმეორე')}
          <PinInput value={b} onChange={setB} label={t('გაიმეორე')} onEnter={() => void save()} />
        </label>
      </div>
      <ErrorText error={error || (problem ? t(problem) : b.length >= a.length && a.length >= 4 && a !== b ? t('PIN-ები არ ემთხვევა') : '')} />
      <div className="cancel-actions">
        {isSet && !onLater && !fresh && (
          <button type="button" className="btn btn-ghost pin-del" disabled={busy} onClick={() => void remove()}>
            {t('წაშლა')}
          </button>
        )}
        {onLater && (
          <button type="button" className="btn btn-ghost" onClick={onLater}>
            {t('მოგვიანებით')}
          </button>
        )}
        <button type="button" className="btn btn-green" disabled={!ready || busy} onClick={() => void save()}>
          {t(fresh ? 'შენახვა' : 'შემდეგი')}
        </button>
      </div>
    </Modal>
  );
}

const Ctx = createContext<() => Promise<boolean>>(async () => false);
export const useAskLogin = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { refresh } = useSession();
  useLang(); // dialogs follow the language switch
  const [step, setStep] = useState<'email' | 'otp' | 'pin' | 'setpin' | null>(null);

  const [email, setEmail] = useState('');
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const ask = useCallback(() => {
    resolver.current?.(false);
    setEmail('');
    setStep('email');
    return new Promise<boolean>((res) => (resolver.current = res));
  }, []);
  const finish = (ok: boolean) => {
    setStep(null);
    resolver.current?.(ok);
    resolver.current = null;
  };
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  // sign in with the site PIN (set earlier in the profile): e-mail or mobile + PIN, no code
  const [login, setLogin] = useState('');
  const [pin, setPin] = useState('');
  const [pinBusy, setPinBusy] = useState(false);
  const [pinError, setPinError] = useState('');
  const pinReady = login.trim().length >= 3 && /^\d{4,6}$/.test(pin);
  const pinSignIn = async () => {
    if (!pinReady || pinBusy) return;
    setPinBusy(true);
    setPinError('');
    try {
      await api('POST', '/public/auth/pinLogin', { Login: login.trim(), Pin: pin });
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
          <button type="button" className="btn btn-pin full" onClick={() => (setPinError(''), setPin(''), setLogin(email), setStep('pin'))}>
            <PinIcon />
            {t('PIN-ით შესვლა')}
          </button>
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
            {t('გამოგიგზავნით ერთჯერად კოდს')}
          </p>
          <input
            type="email"
            placeholder="name@example.com"
            autoComplete="email"
            aria-label={t('ელ. ფოსტა')}
            className="login-email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && valid && setStep('otp')}
            autoFocus
          />
          <button type="button" className="btn btn-green full" disabled={!valid} onClick={() => setStep('otp')}>
            {t('კოდის გაგზავნა')}
          </button>
        </Modal>
      )}
      {step === 'pin' && (
        <Modal onClose={() => finish(false)} labelledBy="pinTitle">
          <h3 id="pinTitle">{t('PIN-ით შესვლა')}</h3>
          <p>{t('შეიყვანე ელ. ფოსტა ან მობილური და PIN-კოდი')}</p>
          <div className="pin-form">
            <input
              type="text"
              placeholder={t('ელ. ფოსტა ან მობილური')}
              autoComplete="username"
              aria-label={t('ელ. ფოსტა ან მობილური')}
              className="login-email"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              autoFocus={!login}
            />
            <PinInput value={pin} onChange={setPin} label="PIN" autoFocus={!!login} onEnter={() => void pinSignIn()} />
          </div>
          <ErrorText error={pinError} />
          <button type="button" className="btn btn-green full" disabled={!pinReady || pinBusy} onClick={() => void pinSignIn()}>
            {t('შესვლა')}
          </button>
          <div className="pin-links">
            <button
              type="button"
              className="linkbtn"
              onClick={() => {
                // forgot the PIN: sign in with a code (a new PIN is set in the profile)
                if (login.includes('@')) setEmail(login.trim());
                setStep('email');
              }}
            >
              {t('PIN დაგავიწყდა?')}
            </button>
            <button type="button" className="linkbtn" onClick={() => setStep('email')}>
              {t('კოდით შესვლა')}
            </button>
          </div>
        </Modal>
      )}
      {step === 'setpin' && (
        <PinModal
          isSet={false}
          fresh
          title="PIN-ის დაყენება"
          intro="შემდეგ ჯერზე შეხვალ ელ. ფოსტით და PIN-ით, კოდის გარეშე. 4–6 ციფრი."
          onClose={() => finish(true)}
          onDone={() => finish(true)}
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
            // no PIN yet — offer to set one now, while the code session is fresh
            const st = await api<{ IsSet: boolean }>('GET', '/client/pin/status').catch(() => null);
            if (st && !st.IsSet) setStep('setpin');
            else finish(true);
          }}
          onClose={() => finish(false)}
        />
      )}
    </Ctx.Provider>
  );
}
