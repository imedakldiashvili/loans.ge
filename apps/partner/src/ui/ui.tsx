import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';

// Small UI pieces with the prototype's classes.

export const fmt = (n: number) => Math.round(n).toLocaleString('en-US').replace(/,/g, ' ');
const pad = (n: number) => String(n).padStart(2, '0');
export const fmtDate = (t: string | number | Date) => {
  const d = new Date(t);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
/** Countdown: mm:ss, over an hour h:mm:ss (prototype fmtCd). */
export const fmtCd = (ms: number) => {
  const t = Math.floor(Math.max(0, ms) / 1000);
  const h = Math.floor(t / 3600);
  return `${h ? h + ':' : ''}${pad(Math.floor((t % 3600) / 60))}:${pad(t % 60)}`;
};
export const curSym = (code: string) => ({ GEL: '₾', USD: '$', EUR: '€' })[code] ?? code;

/** Active switch (prototype `.sw` with `input.act`). */
export const Switch = ({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) => (
  <label className="sw" title={on ? 'აქტიური' : 'გამორთული'}>
    <input type="checkbox" className="act" checked={on} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    <i />
  </label>
);

export const EditIcon = () => (
  <svg viewBox="0 0 24 24">
    <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
  </svg>
);
export const Chevron = () => (
  <svg viewBox="0 0 24 24">
    <path d="M6 9l6 6 6-6" />
  </svg>
);

/** Modal with the prototype markup (.modal > .modal-box, × top right). */
export function Modal({ title, head, children, onClose, wide }: { title: ReactNode; head?: ReactNode; children: ReactNode; onClose: () => void; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" role="dialog" aria-modal="true" style={wide ? { maxWidth: 720 } : undefined}>
        <button type="button" className="modal-x" aria-label="დახურვა" onClick={onClose}>
          ×
        </button>
        <div className="mhead">
          <h3>{title}</h3>
          {head}
        </div>
        {children}
      </div>
    </div>
  );
}

const ToastCtx = createContext<(t: string) => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [text, setText] = useState<string | null>(null);
  const timer = useRef<number>();
  const toast = useCallback((t: string) => {
    setText(t);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setText(null), 2200);
  }, []);
  return (
    <ToastCtx.Provider value={toast}>
      {children}
      {text && <div className="toast">{text}</div>}
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

/** Ticks every second. */
export function useNow() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  return now;
}

export const ErrorLine = ({ error }: { error: string }) => (error ? <div className="lerr" style={{ marginTop: 10 }}>{error}</div> : null);
