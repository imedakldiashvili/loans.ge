import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';

// One list template for every page (prototype `lp`): title + description left, add button right,
// filters, optional extra block, then a panel with the table (header fixed, body scrolls) and the pager.

export const PAGE_SIZES = [10, 20, 50, 100];
const SIZE_KEY = 'adminPageSize';

/** Rows per page — one setting for all lists, remembered in the browser. */
export function usePageSize(): [number, (n: number) => void] {
  const [size, setSize] = useState(() => {
    try {
      const v = Number(localStorage.getItem(SIZE_KEY));
      return PAGE_SIZES.includes(v) ? v : 10;
    } catch {
      return 10;
    }
  });
  return [
    size,
    (n) => {
      setSize(n);
      try {
        localStorage.setItem(SIZE_KEY, String(n));
      } catch {
        /* storage blocked */
      }
    },
  ];
}

export function Pager({ page, totalPages, size, onPage, onSize }: { page: number; totalPages: number; size: number; onPage: (p: number) => void; onSize: (n: number) => void }) {
  const n = Math.max(1, totalPages);
  const nums: ReactNode[] = [];
  let dots = false;
  for (let i = 1; i <= n; i++) {
    if (n > 7 && Math.abs(i - page) > 2 && i !== 1 && i !== n) {
      if (!dots) nums.push(<span key={'d' + i} className="pg-dots">…</span>);
      dots = true;
      continue;
    }
    dots = false;
    nums.push(
      <button key={i} type="button" className={`pg ${i === page ? 'on' : ''}`} aria-label={`გვერდი ${i}`} onClick={() => onPage(i)}>
        {i}
      </button>,
    );
  }
  return (
    <div className="pfoot">
      <label className="pp">
        გვერდზე{' '}
        <select className="ppsel" aria-label="ჩანაწერი გვერდზე" value={size} onChange={(e) => onSize(Number(e.target.value))}>
          {PAGE_SIZES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <span className="pright">
        <nav className="pager">
          <button type="button" className="pg" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="წინა">
            ‹
          </button>
          {nums}
          <button type="button" className="pg" disabled={page >= n} onClick={() => onPage(page + 1)} aria-label="შემდეგი">
            ›
          </button>
        </nav>
        <span className="pcount">{n} გვერდი</span>
      </span>
    </div>
  );
}

/** Table with a fixed header: the header is a separate table (`.thw`), the body scrolls under it; widths come from a ghost head. */
export function DataTable({ head, children, className = '' }: { head: ReactNode; children: ReactNode; className?: string }) {
  const tbl = useRef<HTMLDivElement>(null);
  const thw = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const t = tbl.current;
    const w = thw.current;
    if (!t || !w) return;
    const sync = () => (w.style.paddingRight = `${t.offsetWidth - t.clientWidth}px`);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(t);
    return () => ro.disconnect();
  });
  return (
    <>
      <div className="thw" ref={thw}>
        <table className={className}>
          <thead>{head}</thead>
        </table>
      </div>
      <div className="tbl" ref={tbl} onScroll={(e) => thw.current && (thw.current.scrollLeft = e.currentTarget.scrollLeft)}>
        <table className={className}>
          <thead className="ghost">{head}</thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </>
  );
}

interface ListPageProps {
  title: ReactNode;
  desc?: ReactNode;
  add?: ReactNode;
  filters?: ReactNode;
  extra?: ReactNode;
  back?: { label: string; onClick: () => void };
  caption?: ReactNode;
  children: ReactNode;
  foot?: ReactNode;
}

export function ListPage({ title, desc, add, filters, extra, back, caption, children, foot }: ListPageProps) {
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, []);
  return (
    <>
      <div className="lp-top">
        {back && (
          <button type="button" className="btn btn-ghost back" title={back.label} onClick={back.onClick}>
            « უკან
          </button>
        )}
        <div className="lp-title">
          <h2>{title}</h2>
          {desc && <p>{desc}</p>}
        </div>
        {add && <div className="lp-add">{add}</div>}
      </div>
      {filters && <div className="lp-filters">{filters}</div>}
      {extra}
      <div className="panel">
        {caption && <h3 className="pcap">{caption}</h3>}
        {children}
        {foot}
      </div>
    </>
  );
}

/** Empty / loading / error row spanning the table. */
export const StateRow = ({ span, loading, error, empty = 'ჩანაწერი არ არის' }: { span: number; loading?: boolean; error?: string | null; empty?: string }) => (
  <tr>
    <td colSpan={span} className="empty">
      {loading ? 'იტვირთება…' : error ? error : empty}
    </td>
  </tr>
);
