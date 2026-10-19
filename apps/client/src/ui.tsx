import { Dispatch, ReactNode, SetStateAction, useEffect, useState } from 'react';

// Small shared pieces with the prototype's markup (loans-ge.html).

export const fmt = (n: number) => Math.round(n).toLocaleString('en-US').replace(/,/g, ' ');
const pad = (n: number) => String(n).padStart(2, '0');
export const fmtDate = (t: string | number | Date) => {
  const d = new Date(t);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export const fmtDay = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split('-').reverse().join('.') : '—');
/** mm:ss, over an hour h:mm:ss. */
export const fmtCd = (ms: number) => {
  const t = Math.floor(Math.max(0, ms) / 1000);
  const h = Math.floor(t / 3600);
  return `${h ? h + ':' : ''}${pad(Math.floor((t % 3600) / 60))}:${pad(t % 60)}`;
};
export const fmtPhone = (p: string) => `+995 ${p.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3')}`;
export const curSym = (code: string) => ({ GEL: '₾', USD: '$', EUR: '€' })[code] ?? code;
export const money = (n: number, cur = 'GEL') => `${fmt(n)} ${curSym(cur)}`;

/** Ticks every second. */
export function useNow() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  return now;
}

/** Prototype modal: .modal > .modal-box, closes on Escape and on the backdrop. */
export function Modal({ children, onClose, className = '', labelledBy, noClose, id }: { children: ReactNode; onClose: () => void; className?: string; labelledBy?: string; noClose?: boolean; id?: string }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal" id={id} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal-box ${className}`} role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
        {!noClose && (
          <button type="button" className="modal-x" aria-label="დახურვა" onClick={onClose}>
            ×
          </button>
        )}
        {children}
      </div>
    </div>
  );
}

export const Chevron = ({ w = 2.5 }: { w?: number }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 9l6 6 6-6" />
  </svg>
);

export const ErrorText = ({ error }: { error: string }) => (error ? <p className="form-err" style={{ color: 'var(--orange)', margin: '8px 0 0' }}>{error}</p> : null);

/** The same rules as the API: exactly `len` digits, not all the same, not in a row. */
export const pinProblem = (p: string, len: number) =>
  !new RegExp(`^\\d{${len}}$`).test(p) ? `${len} ციფრი` : /^(\d)\1+$/.test(p) ? 'ერთნაირი ციფრები არ გამოდგება' : '0123456789'.includes(p) || '9876543210'.includes(p) ? 'ციფრები ზედიზედ არ გამოდგება' : '';

/**
 * The PIN's own keypad: the entered digits as dots, keys 1–9, 0 and ⌫ (no phone keyboard pops up).
 * The computer's keyboard works too: digits, Backspace, Enter (→ onEnter).
 */
export function PinPad({ value, onChange, onEnter, label, length, digits = false }: { value: string; onChange: Dispatch<SetStateAction<string>>; onEnter?: () => void; label: string; length: number; /** show the digits in boxes (a one-time code) instead of dots (a PIN) */ digits?: boolean }) {
  // always from the latest value — quick taps / typing never lose a digit
  const press = (k: string) => onChange((v) => (k === '⌫' ? v.slice(0, -1) : v.length < length ? v + k : v));
  // the last digit → on by itself (sign in / next step)
  useEffect(() => {
    if (value.length === length) onEnter?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, length]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) {
        e.preventDefault();
        press(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        press('⌫');
      } else if (e.key === 'Enter') onEnter?.();
    };
    // a copied code / PIN: Ctrl+V — only its digits, up to the length
    const paste = (e: ClipboardEvent) => {
      const d = (e.clipboardData?.getData('text') ?? '').replace(/\D/g, '').slice(0, length);
      if (!d) return;
      e.preventDefault();
      onChange(d);
    };
    document.addEventListener('keydown', key);
    document.addEventListener('paste', paste);
    return () => {
      document.removeEventListener('keydown', key);
      document.removeEventListener('paste', paste);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onChange, onEnter, length]);
  // the paste key (phones have no Ctrl+V): reads the clipboard — the browser may ask for permission
  const [pasteErr, setPasteErr] = useState(false);
  const pasteKey = async () => {
    try {
      const d = (await navigator.clipboard.readText()).replace(/\D/g, '').slice(0, length);
      if (d) onChange(d);
      setPasteErr(!d);
    } catch {
      setPasteErr(true);
    }
  };
  return (
    <div className="pin-pad" role="group" aria-label={label}>
      {/* exactly as many places as the PIN has digits */}
      {digits ? (
        <div className="code-boxes" aria-live="polite" aria-label={`${value.length} / ${length}`}>
          {Array.from({ length }, (_, i) => (
            <span key={i} className={i === value.length ? 'next' : undefined}>
              {value[i] ?? ''}
            </span>
          ))}
        </div>
      ) : (
        <div className="pin-dots" aria-live="polite" aria-label={`${value.length} / ${length}`}>
          {Array.from({ length }, (_, i) => (
            <i key={i} className={i < value.length ? 'on' : undefined} />
          ))}
        </div>
      )}
      <div className="pin-keys">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((k, i) =>
          k ? (
            <button key={i} type="button" className={`pin-key${k === '⌫' ? ' back' : ''}`} aria-label={k === '⌫' ? 'წაშლა' : k} disabled={k === '⌫' && !value} onClick={() => press(k)}>
              {k}
            </button>
          ) : (
            <button key={i} type="button" className={`pin-key paste${pasteErr ? ' err' : ''}`} title="ჩასმა" aria-label="ჩასმა" onClick={() => void pasteKey()}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="8" y="3" width="8" height="4" rx="1" />
                <path d="M16 5h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2" />
              </svg>
            </button>
          ),
        )}
      </div>
    </div>
  );
}
