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

/** The same rules as the API: 4–6 digits, not all the same, not in a row. */
export const pinProblem = (p: string) =>
  !/^\d{4,6}$/.test(p) ? '4–6 ციფრი' : /^(\d)\1+$/.test(p) ? 'ერთნაირი ციფრები არ გამოდგება' : '0123456789'.includes(p) || '9876543210'.includes(p) ? 'ციფრები ზედიზედ არ გამოდგება' : '';

/**
 * The PIN's own keypad: the entered digits as dots, keys 1–9, 0 and ⌫ (no phone keyboard pops up).
 * The computer's keyboard works too: digits, Backspace, Enter (→ onEnter).
 */
export function PinPad({ value, onChange, onEnter, label }: { value: string; onChange: Dispatch<SetStateAction<string>>; onEnter?: () => void; label: string }) {
  // always from the latest value — quick taps / typing never lose a digit
  const press = (k: string) => onChange((v) => (k === '⌫' ? v.slice(0, -1) : v.length < 6 ? v + k : v));
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
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onChange, onEnter]);
  return (
    <div className="pin-pad" role="group" aria-label={label}>
      {/* 4–6 digits: at least four places, one more while it can grow */}
      <div className="pin-dots" aria-live="polite" aria-label={`${value.length} / 6`}>
        {Array.from({ length: Math.min(6, Math.max(4, value.length + (value.length >= 4 && value.length < 6 ? 1 : 0))) }, (_, i) => (
          <i key={i} className={i < value.length ? 'on' : undefined} />
        ))}
      </div>
      <div className="pin-keys">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((k, i) =>
          k ? (
            <button key={i} type="button" className={`pin-key${k === '⌫' ? ' back' : ''}`} aria-label={k === '⌫' ? 'წაშლა' : k} disabled={k === '⌫' && !value} onClick={() => press(k)}>
              {k}
            </button>
          ) : (
            <span key={i} />
          ),
        )}
      </div>
    </div>
  );
}
