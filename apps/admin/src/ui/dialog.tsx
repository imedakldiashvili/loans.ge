import { FormEvent, ReactNode, useEffect, useRef, useState } from 'react';
import { ApiError } from '../api/client';
import { Icon } from './icons';

/** Field errors from the API (Error.Details) by field name, for inputs inside a dialog. */
export type FieldErrors = Record<string, string>;

interface Props {
  title: string;
  children: ReactNode;
  onClose: () => void;
  /** Save handler; throw (ApiError) to keep the dialog open and show the error. No handler → view-only dialog. */
  onOk?: () => Promise<unknown> | unknown;
  okLabel?: string;
  okClass?: string;
  wide?: boolean;
  onErrors?: (e: FieldErrors) => void;
}

/** Modal dialog with the prototype layout: title, body, „შენახვა" + „დახურვა". */
export function Dialog({ title, children, onClose, onOk, okLabel = 'შენახვა', okClass = 'btn-green', wide, onErrors }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    const f = d?.querySelector<HTMLElement>('input:not([type=checkbox]):not([type=radio]):not([disabled]), select:not([disabled]), textarea');
    f?.focus();
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!onOk || busy) return;
    setBusy(true);
    setError('');
    onErrors?.({});
    try {
      await onOk();
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        onErrors?.(Object.fromEntries(err.details.map((d) => [d.Field, d.Message])));
      } else if (err instanceof Error && err.message) setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <dialog ref={ref} className={wide ? 'wide' : ''} onCancel={(e) => (e.preventDefault(), onClose())}>
      <form method="dialog" onSubmit={submit}>
        <div className="dlg-h">
          <h3>{title}</h3>
          <button type="button" className="ib" aria-label="დახურვა" onClick={onClose}>
            <Icon.close />
          </button>
        </div>
        <div className="dlg-b">
          {error && <div className="lerr">{error}</div>}
          {children}
        </div>
        <div className="dlg-f">
          {onOk && (
            <button type="submit" className={`btn ${okClass}`} disabled={busy}>
              {okLabel}
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            დახურვა
          </button>
        </div>
      </form>
    </dialog>
  );
}

/** „წავშალოთ …?" confirmation with a red button. */
export function Confirm({ title, text, onOk, onClose, okLabel = 'წაშლა' }: { title: string; text: string; onOk: () => Promise<unknown> | unknown; onClose: () => void; okLabel?: string }) {
  return (
    <Dialog title={title} onOk={onOk} onClose={onClose} okLabel={okLabel} okClass="btn-red">
      <p style={{ margin: 0, color: 'var(--muted)' }}>{text}</p>
    </Dialog>
  );
}

/** Small error line under a field. */
export const FieldError = ({ errors, field }: { errors: FieldErrors; field: string }) =>
  errors[field] ? <small style={{ color: 'var(--red)' }}>{errors[field]}</small> : null;
