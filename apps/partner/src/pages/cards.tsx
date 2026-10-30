import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { crud } from '../api';
import { curSym, EditIcon, Modal, Switch, useToast } from '../ui/ui';
import { CardDialog, CardInfo, CardRow, errText, Product, useProducts } from './products';

// Product cards (back office): every card of the organisation's products in one list. A card = an offer — its terms by
// offer type and currency, several on different amount ranges; a sales manager picks one when sending an offer.
// Add / edit / switch on-off / delete; the same cards the product page shows.

export function CardsPage() {
  const q = useProducts();
  const qc = useQueryClient();
  const toast = useToast();
  const [prod, setProd] = useState('');
  const [cur, setCur] = useState('');
  const [card, setCard] = useState<{ p: Product; cur: string; k: CardRow | null } | null>(null);
  const [pick, setPick] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ['products'] });
  const products = q.data ?? [];
  const curs = [...new Set(products.flatMap((p) => p.Currencies))];
  const rows = products
    .filter((p) => !prod || p.ID === Number(prod))
    .flatMap((p) => p.Cards.filter((k) => !cur || k.Currency === cur).map((k) => ({ p, k })));

  return (
    <div className="main">
      <div className="top">
        <h2>პროდუქტის ბარათები</h2>
        <span className="count">{rows.length}</span>
        <button type="button" className="btn btn-green topbtn" disabled={!products.length} onClick={() => setPick(true)}>
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
        {rows.map(({ p, k }) => (
          <div key={k.ID} className="card">
            <div className="prow">
              <span className="ico">
                <svg viewBox="0 0 24 24">
                  <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h5" />
                </svg>
              </span>
              <CardInfo p={p} k={k} />
              <span className="pmeta">
                <b>{p.ProductType.NameKa}</b>
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
                <button type="button" className="ib edit" title="რედაქტირება" aria-label="რედაქტირება" onClick={() => setCard({ p, cur: k.Currency, k })}>
                  <EditIcon />
                </button>
              </span>
            </div>
          </div>
        ))}
      </div>
      {pick && <PickProduct products={products} onClose={() => setPick(false)} onPick={(p, c) => (setPick(false), setCard({ p, cur: c, k: null }))} />}
      {card && <CardDialog p={card.p} cur={card.cur} k={card.k} onClose={() => setCard(null)} onSaved={() => (setCard(null), refresh())} />}
    </div>
  );
}

/** A new card: first its product and currency (the product's currencies), then the card form. */
function PickProduct({ products, onClose, onPick }: { products: Product[]; onClose: () => void; onPick: (p: Product, cur: string) => void }) {
  const [pid, setPid] = useState(products[0]?.ID ?? 0);
  const p = products.find((x) => x.ID === pid);
  const [cur, setCur] = useState(p?.Currencies[0] ?? '');
  return (
    <Modal title="ახალი ბარათი" onClose={onClose}>
      <div className="form f main-form">
        <div className="fld">
          <label htmlFor="tProd">პროდუქტი</label>
          <select
            id="tProd"
            value={pid}
            onChange={(e) => {
              const n = products.find((x) => x.ID === Number(e.target.value));
              setPid(Number(e.target.value));
              setCur(n?.Currencies[0] ?? '');
            }}
          >
            {products.map((x) => (
              <option key={x.ID} value={x.ID}>
                {x.ProductType.NameKa}
              </option>
            ))}
          </select>
        </div>
        <div className="fld">
          <label htmlFor="tCur">
            ვალუტა <small className="muted">(პროდუქტის ვალუტებიდან)</small>
          </label>
          <select id="tCur" value={cur} onChange={(e) => setCur(e.target.value)}>
            {(p?.Currencies ?? []).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="fbtns">
          <button type="button" className="btn btn-green" disabled={!p || !cur} onClick={() => p && onPick(p, cur)}>
            გაგრძელება
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            დახურვა
          </button>
        </div>
      </div>
    </Modal>
  );
}
