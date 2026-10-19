import { ReactNode, useEffect, useState } from 'react';

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

/** The passkey symbol (a person and a key — as the passkey icon of browsers / FIDO), used on every passkey button. */
export const PasskeyIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="pk-icon">
    <circle cx="9" cy="7.5" r="4" fill="currentColor" />
    <path d="M1.5 20.5c0-3.9 3.4-7 7.5-7 1.7 0 3.3.5 4.5 1.4v5.6z" fill="currentColor" />
    <circle cx="18.5" cy="10.5" r="3" fill="none" stroke="currentColor" strokeWidth="2" />
    <path d="M18.5 13.5v8M18.5 17.5h2.5M18.5 20h2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);
