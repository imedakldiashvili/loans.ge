import { Icon } from './icons';

/** Active switch (prototype `.sw`). */
export function Switch({ checked, onChange, disabled, id }: { checked: boolean; onChange?: (v: boolean) => void; disabled?: boolean; id?: string }) {
  return (
    <label className="sw" title={checked ? 'აქტიურია' : 'გამორთულია'}>
      <input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange?.(e.target.checked)} />
      <i />
    </label>
  );
}

/** ↑↓ arrows cell. */
export function ArrowsCell({ index, count, onMove, disabled }: { index: number; count: number; onMove: (dir: 'up' | 'down') => void; disabled?: boolean }) {
  return (
    <td className="num" style={{ whiteSpace: 'nowrap' }}>
      <button type="button" className="ib" title="ზემოთ" disabled={disabled || index === 0} onClick={() => onMove('up')}>
        <Icon.up />
      </button>{' '}
      <button type="button" className="ib" title="ქვემოთ" disabled={disabled || index === count - 1} onClick={() => onMove('down')}>
        <Icon.down />
      </button>
    </td>
  );
}

/** ✎ and 🗑 buttons. */
export function RowActions({ onEdit, onDelete, children }: { onEdit?: () => void; onDelete?: () => void; children?: React.ReactNode }) {
  return (
    <td className="acts">
      {children}
      {onEdit && (
        <>
          {' '}
          <button type="button" className="ib" title="რედაქტირება" onClick={onEdit}>
            <Icon.edit />
          </button>
        </>
      )}
      {onDelete && (
        <>
          {' '}
          <button type="button" className="ib danger" title="წაშლა" onClick={onDelete}>
            <Icon.del />
          </button>
        </>
      )}
    </td>
  );
}

/** Bilingual value: EN on top (if any), GE below — prototype `biView`. */
export function BiView({ ka, en }: { ka: string; en?: string | null }) {
  return (
    <span className="bi-v">
      {en ? (
        <>
          <b>
            <i className="lg">EN</i>
            {en}
          </b>
          <small>
            <i className="lg">GE</i>
            {ka}
          </small>
        </>
      ) : (
        <b>
          <i className="lg">GE</i>
          {ka}
        </b>
      )}
    </span>
  );
}

/** Bilingual input: EN first, then GE (required) — prototype `biInput`. */
export function BiInput({ value, onChange, placeholder = '', id }: { value: { ka: string; en: string }; onChange: (v: { ka: string; en: string }) => void; placeholder?: string; id?: string }) {
  return (
    <div className="bi" id={id}>
      <label className="bi-row">
        <span className="lang">EN</span>
        <input type="text" value={value.en} placeholder={placeholder ? placeholder + ' (EN)' : 'English'} autoComplete="off" onChange={(e) => onChange({ ...value, en: e.target.value })} />
      </label>
      <label className="bi-row">
        <span className="lang">GE</span>
        <input type="text" id={id ? id + '_ka' : undefined} value={value.ka} placeholder={placeholder} required autoComplete="off" onChange={(e) => onChange({ ...value, ka: e.target.value })} />
      </label>
    </div>
  );
}

/** Lowercase English code from a name: "Kvemo Kartli" → "kvemo_kartli". */
export const slug = (s: string) =>
  String(s || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

export const fmt = (n: number) => Math.round(n).toLocaleString('en-US').replace(/,/g, ' ');
const pad = (n: number) => String(n).padStart(2, '0');
export const fmtDate = (t: string | number | Date) => {
  const d = new Date(t);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
