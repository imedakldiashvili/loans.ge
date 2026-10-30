import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { crud } from '../api';
import { Chevron, curSym, EditIcon, Pager, Switch, usePageSize, useToast } from '../ui/ui';
import { CardForm, CardInfo, CopyIcon, DelIcon, errText, removeCard, useProducts } from './products';

// Product cards (back office): every card of the organisation's products in one list. A card = an offer — its terms by
// offer type and currency, several on different amount ranges; a sales manager picks one when sending an offer.
// A row: the type, the amount · term · rate; the other terms open below it (chevron). On the row: on-off, copy, edit, delete;
// add / edit on the card's own page: /cards/new (?product=…&cur=… or ?copy={id}) and /cards/{id}.

export function CardsPage() {
  const q = useProducts();
  const qc = useQueryClient();
  const toast = useToast();
  const [prod, setProd] = useState('');
  const [cur, setCur] = useState('');
  const [open, setOpen] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [size, setSize] = usePageSize();
  const nav = useNavigate();
  const refresh = () => qc.invalidateQueries({ queryKey: ['products'] });
  const products = q.data ?? [];
  const curs = [...new Set(products.flatMap((p) => p.Currencies))];
  const rows = products
    .filter((p) => !prod || p.ID === Number(prod))
    .flatMap((p) => p.Cards.filter((k) => !cur || k.Currency === cur).map((k) => ({ p, k })));
  // all cards come at once (with the products) — paged here
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const pg = Math.min(page, pages);
  const shown = rows.slice((pg - 1) * size, pg * size);
  useEffect(() => setPage(1), [prod, cur, size]);

  return (
    <div className="main">
      <div className="top">
        <h2>პროდუქტის ბარათები</h2>
        <button type="button" className="btn btn-green topbtn" disabled={!products.length} onClick={() => nav('/cards/new')}>
          + ბარათი
        </button>
      </div>
      <div className="srow">
        <select className="fsel" aria-label="პროდუქტი" value={prod} onChange={(e) => setProd(e.target.value)}>
          <option value="">აირჩიე პროდუქტი</option>
          {products.map((p) => (
            <option key={p.ID} value={p.ID}>
              {p.ProductType.NameKa}
            </option>
          ))}
        </select>
        <select className="fsel" aria-label="ვალუტა" value={cur} onChange={(e) => setCur(e.target.value)}>
          <option value="">აირჩიე ვალუტა</option>
          {curs.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <div className="list">
        {!rows.length && <div className="empty">{q.isLoading ? 'იტვირთება…' : 'ბარათი არ არის'}</div>}
        {shown.map(({ p, k }) => (
          <div key={k.ID} className={`card${open === k.ID ? ' open' : ''}`}>
            <div className="prow pr4 crd">
              <span className="ico">
                <svg viewBox="0 0 24 24">
                  <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h5" />
                </svg>
              </span>
              <CardInfo p={p} k={k} part="brief" withProduct />
              <span className="pmeta">
                <small>
                  {k.Currency} {curSym(k.Currency)}
                  {!p.IsEnable && ' · პროდუქტი გამორთულია'}
                </small>
              </span>
              <span className="racts p">
                <Switch
                  on={k.IsEnable}
                  onChange={async (v) => {
                    try {
                      await crud('partner', 'card').enable(k, v);
                      toast(v ? 'ბარათი ჩაირთო' : 'ბარათი გამოირთო');
                      refresh();
                    } catch (e) {
                      toast(errText(e));
                    }
                  }}
                />
                <button type="button" className="ib" title="ასლი - ახალი ბარათი ამ პირობებით" aria-label="ასლი" onClick={() => nav(`/cards/new?copy=${k.ID}`)}>
                  <CopyIcon />
                </button>
                <button type="button" className="ib edit" title="რედაქტირება" aria-label="რედაქტირება" onClick={() => nav(`/cards/${k.ID}`)}>
                  <EditIcon />
                </button>
                <button type="button" className="ib del" title="წაშლა" aria-label="წაშლა" onClick={async () => (await removeCard(k, toast)) && refresh()}>
                  <DelIcon />
                </button>
              </span>
              <button type="button" className="ib tg" aria-label="ჩამოშლა" aria-expanded={open === k.ID} onClick={() => setOpen(open === k.ID ? null : k.ID)}>
                <Chevron />
              </button>
            </div>
            {open === k.ID && (
              <div className="det cards">
                <CardInfo p={p} k={k} part="rest" />
              </div>
            )}
          </div>
        ))}
      </div>
      <Pager page={pg} totalPages={pages} total={rows.length} size={size} onPage={setPage} onSize={setSize} />
    </div>
  );
}

/** /cards/new and /cards/{id}: the card form on its own page. A new card picks its product and currency first
 *  (?product=…&cur=… preset them — the product page's "+ შეთავაზება"); back goes where it came from. */
export function CardFormPage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/cards';
  const nav = useNavigate();
  const qc = useQueryClient();
  const q = useProducts();
  const products = q.data ?? [];
  const isNew = id === 'new';
  const all = products.flatMap((p) => p.Cards.map((k) => ({ p, k })));
  const own = isNew ? null : all.find((x) => x.k.ID === Number(id));
  // ?copy={id}: a new card from that one's product, currency, type and values
  const copy = isNew && params.get('copy') ? all.find((x) => x.k.ID === Number(params.get('copy'))) ?? null : null;
  const [pid, setPid] = useState(Number(params.get('product')) || 0);
  const [cur, setCur] = useState(params.get('cur') ?? '');
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, []);
  // a new card: the first product / its first currency until chosen
  const p = own?.p ?? products.find((x) => x.ID === (pid || copy?.p.ID)) ?? products[0];
  const c = own?.k.Currency ?? (p?.Currencies.includes(cur || copy?.k.Currency || '') ? cur || copy!.k.Currency : p?.Currencies[0] ?? '');
  const back = () => {
    void qc.invalidateQueries({ queryKey: ['products'] });
    nav(from);
  };

  if (!isNew && !Number(id)) return <Navigate to="/cards" replace />;
  // « უკან, then the title, save on the right (it submits the card form)
  const head = (sub: string, save = false) => (
    <div className="top pf">
      <button type="button" className="btn btn-ghost" onClick={back}>
        « უკან
      </button>
      <h2>
        პროდუქტის ბარათები <small className="muted">- {sub}</small>
      </h2>
      {save && (
        <button type="submit" form="cardf" className="btn btn-green">
          შენახვა
        </button>
      )}
    </div>
  );
  if (!p || (!isNew && !own))
    return (
      <div className="main">
        {head(isNew ? 'ახალი ბარათი' : 'ბარათი')}
        <div className="empty">{q.isLoading ? 'იტვირთება…' : isNew ? 'პროდუქტი არ არის - პროდუქტებს ადმინისტრატორი ამატებს' : 'ბარათი ვერ მოიძებნა'}</div>
      </div>
    );
  return (
    <div className="main">
      {head(isNew ? (copy ? 'ახალი ბარათი (ასლი)' : 'ახალი ბარათი') : 'რედაქტირება', true)}
      <CardForm
        key={`${p.ID}|${c}|${id}`}
        p={p}
        cur={c}
        k={own?.k ?? null}
        copy={copy && copy.p.ID === p.ID ? copy.k : null}
        onSaved={back}
        head={
          <>
            <div className="frow">
              <label htmlFor="kProd">პროდუქტი:</label>
              <div className="one">
                {isNew ? (
                  <select id="kProd" value={p.ID} onChange={(e) => setPid(Number(e.target.value))}>
                    {products.map((x) => (
                      <option key={x.ID} value={x.ID}>
                        {x.ProductType.NameKa}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="ro">{p.ProductType.NameKa}</div>
                )}
              </div>
            </div>
            <div className="frow">
              <label htmlFor="kCur">ვალუტა:</label>
              <div className="one">
                {isNew ? (
                  <select id="kCur" value={c} onChange={(e) => setCur(e.target.value)}>
                    {p.Currencies.map((x) => (
                      <option key={x} value={x}>
                        {x} {curSym(x)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="ro">
                    {c} {curSym(c)}
                  </div>
                )}
              </div>
            </div>
          </>
        }
      />
    </div>
  );
}
