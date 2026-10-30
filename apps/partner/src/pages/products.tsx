import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { ApiError, crud, findAll, Ref } from '../api';
import { Field, useRefs } from '../session';
import { Chevron, curSym, EditIcon, ErrorLine, fmt, Modal, Switch, useToast } from '../ui/ui';

// Products of the organisation (prototype partner.html renderProducts / productEditPage / cardFields).
// Product = product type (admin list) + currencies; offer types ("cards") per currency, values follow the type's field schema.

type Val = number | string | boolean | null;
export interface CardRow {
  ID: number;
  UID: string;
  IsEnable: boolean;
  ProductID: number;
  OfferTypeID: number;
  Currency: string;
  Values: Record<string, Val>;
}
export interface Product {
  ID: number;
  UID: string;
  IsEnable: boolean;
  ProductTypeID: number;
  Description: string | null;
  Currencies: string[];
  ProductType: { ID: number; NameKa: string; NoTerm: boolean };
  Cards: CardRow[];
}

/** Values keys come back PascalCased by the API (minAmt → MinAmt). */
const pk = (k: string) => k.charAt(0).toUpperCase() + k.slice(1);
export const errText = (e: unknown) => (e instanceof ApiError ? [e.message, ...e.details.map((x) => `${x.Field}: ${x.Message}`)].join(' - ') : 'შეცდომა');
const cardsLabel = (n: number) => `${n} შეთავაზება`;

export const useProducts = () => useQuery({ queryKey: ['products'], queryFn: () => findAll<Product>('partner', 'product') });

export function ProductsPage() {
  const q = useProducts();
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState<number | null>(null);
  const nav = useNavigate();
  const refresh = () => qc.invalidateQueries({ queryKey: ['products'] });
  const list = q.data ?? [];
  return (
    <div className="main">
      <div className="top">
        <h2>პროდუქტები</h2>
      </div>
      {/* products are given by the admin (organisation → product types); here they are switched on / off and get their offer cards */}
      <div className="list">
        {!list.length && <div className="empty">{q.isLoading ? 'იტვირთება…' : 'პროდუქტი არ არის - პროდუქტებს ადმინისტრატორი ამატებს'}</div>}
        {list.map((p) => {
          const curs = p.Currencies.map((c) => [c, p.Cards.filter((k) => k.Currency === c).length] as const).filter((x) => x[1]);
          return (
            <div key={p.ID} className={`card${open === p.ID ? ' open' : ''}`}>
              <div className="prow pr4">
                <span className="ico">
                  <svg viewBox="0 0 24 24">
                    <path d="M20 7H4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2zM16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
                  </svg>
                </span>
                <span className="pinfo">
                  <b>{p.ProductType.NameKa}</b>
                  {p.Description && <small>{p.Description}</small>}
                </span>
                <span className="pmeta curs">
                  {curs.length ? (
                    curs.map(([c, n]) => (
                      <span key={c} className="cl">
                        <b>{c}</b>
                        <span className="n">{n}</span>
                      </span>
                    ))
                  ) : (
                    <small>შეთავაზების ტიპი არ არის</small>
                  )}
                </span>
                <span className="racts p">
                  <Switch
                    on={p.IsEnable}
                    onChange={async (v) => {
                      try {
                        await crud('partner', 'product').enable(p, v);
                        toast(v ? 'პროდუქტი ჩაირთო' : 'პროდუქტი გამოირთო');
                        refresh();
                      } catch (e) {
                        toast(errText(e));
                      }
                    }}
                  />
                  <button type="button" className="ib edit" title="რედაქტირება" aria-label="რედაქტირება" onClick={() => nav(`/products/${p.ID}`)}>
                    <EditIcon />
                  </button>
                </span>
                <button type="button" className="ib tg" aria-label="ჩამოშლა" aria-expanded={open === p.ID} onClick={() => setOpen(open === p.ID ? null : p.ID)}>
                  <Chevron />
                </button>
              </div>
              {open === p.ID && (
                <div className="det cards">
                  {curs.length ? (
                    <div className="ccols" style={{ ['--n' as string]: curs.length }}>
                      {curs.map(([c]) => {
                        const ks = p.Cards.filter((k) => k.Currency === c);
                        return (
                          <div key={c} className="ccol">
                            <div className="chead">
                              <b>
                                {c} <span className="muted">{curSym(c)}</span>
                              </b>
                              <small>{cardsLabel(ks.length)}</small>
                            </div>
                            <div className="cgrid">
                              {ks.map((k) => (
                                <div key={k.ID} className={`crow ro${k.IsEnable ? '' : ' off'}`}>
                                  <CardInfo p={p} k={k} />
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="empty small">შეთავაზების ტიპი არ არის</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Card name + short summary from the schema (prototype cardSummary). */
export function CardInfo({ p, k }: { p: Product; k: CardRow }) {
  const { fields, offerTypes } = useRefs();
  const fs = fields.filter((f) => f.ProductTypeID === p.ProductTypeID);
  const has = (key: string) => fs.some((f) => f.Key === key);
  const v = (key: string) => k.Values[pk(key)] as number | undefined;
  const cur = curSym(k.Currency);
  const l1 = [has('minAmt') && `თანხა ${fmt(v('minAmt') ?? 0)}–${fmt(v('maxAmt') ?? 0)} ${cur}`, has('minM') && `ვადა ${v('minM')}–${v('maxM')} თვე`].filter(Boolean).join(' · ');
  const l2 = [
    has('rate') && `${v('rate')}%`,
    has('effRate') && v('effRate') && `ეფექტური ${v('effRate')}%`,
    has('feePct') && `საკომისიო ${v('feePct') ?? 0}%${v('feeMin') ? ` (მინ. ${fmt(v('feeMin')!)} ${cur})` : ''}`,
    has('insPct') && `დაზღვევა ${v('insPct') ?? 0}%/თვე${v('insMin') ? ` (მინ. ${fmt(v('insMin')!)} ${cur})` : ''}`,
  ]
    .filter(Boolean)
    .join(' · ');
  const BASE = ['minAmt', 'maxAmt', 'minM', 'maxM', 'rate', 'effRate', 'minMonthly', 'maxMonthly', 'feePct', 'feeMin', 'insPct', 'insMin'];
  const extra = fs
    .filter((f) => !BASE.includes(f.Key))
    .map((f) => {
      const x = k.Values[pk(f.Key)] ?? f.DefaultValue;
      return f.Kind === 'bool' ? (x ? f.LabelKa : '') : `${f.LabelKa.replace(/,.*$/, '')}: ${f.Kind === 'money' ? `${fmt(Number(x))} ${cur}` : x ?? '-'}`;
    })
    .filter(Boolean)
    .join(' · ');
  return (
    <span className="pinfo">
      <b>
        {offerTypes.find((o) => o.ID === k.OfferTypeID)?.NameKa ?? '-'}
        {!k.IsEnable && <small className="muted"> (გამორთული)</small>}
      </b>
      <small>{l1}</small>
      <small>{l2}</small>
      {extra && <small className="extra">{extra}</small>}
    </span>
  );
}

/** /products/new and /products/{id}: the product form on its own address. */
export function ProductFormPage() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  // there is no "new product" — the admin adds products
  if (!Number(id)) return <Navigate to="/products" replace />;
  return (
    <ProductForm
      key={id}
      id={Number(id)}
      onBack={() => {
        void qc.invalidateQueries({ queryKey: ['products'] });
        nav('/products');
      }}
    />
  );
}

/** Product page: the type (the admin's, read only), description, currencies and the offer types per currency. */
function ProductForm({ id, onBack }: { id: number; onBack: () => void }) {
  const { productTypes, currencies } = useRefs();
  const products = useProducts();
  const qc = useQueryClient();
  const toast = useToast();
  // types the organisation accepts (admin: organizationProductType) — the API validates; offer the ones not taken yet first
  const p = products.data?.find((x) => x.ID === id);
  const [desc, setDesc] = useState<string | null>(null);
  const [curs, setCurs] = useState<string[] | null>(null);
  const [openCur, setOpenCur] = useState<Set<string>>(new Set());
  const [card, setCard] = useState<{ cur: string; k: CardRow | null } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, []);

  const t = p?.ProductTypeID ?? null; // the admin's choice, sent back unchanged
  const d = desc ?? p?.Description ?? '';
  const cs = curs ?? p?.Currencies ?? [];
  const refresh = () => qc.invalidateQueries({ queryKey: ['products'] });

  const save = async (nextCurs = cs, quiet = false) => {
    if (!nextCurs.length) return setError('აირჩიე მინიმუმ ერთი ვალუტა'), null;
    setBusy(true);
    setError('');
    try {
      const body = { ProductTypeID: t, Description: d.trim() || null, Currencies: nextCurs };
      if (!p) return null;
      const r = await crud('partner', 'product').edit(p, body);
      await refresh();
      if (!quiet) toast('პროდუქტი შეინახა');
      return r;
    } catch (e) {
      setError(errText(e));
      return null;
    } finally {
      setBusy(false);
    }
  };

  if (!p) return <div className="main"><div className="empty">{products.isLoading ? 'იტვირთება…' : 'პროდუქტი ვერ მოიძებნა'}</div></div>;
  return (
    <div className="main">
      <div className="top pf">
        <button type="button" className="btn btn-ghost" onClick={onBack}>
          ‹ უკან
        </button>
        <h2>პროდუქტის რედაქტირება</h2>
      </div>
      <div className="card">
        <div className="form f">
          <div className="fld">
            <label>
              პროდუქტი <small className="muted">(ადმინისტრატორი ამატებს)</small>
            </label>
            <div className="ro">{productTypes.find((x) => x.ID === t)?.NameKa ?? p.ProductType.NameKa}</div>
          </div>
          <div className="fld">
            <label htmlFor="fDesc">აღწერა</label>
            <input id="fDesc" maxLength={500} value={d} onChange={(e) => setDesc(e.target.value)} />
          </div>
          <div className="fld">
            <label>
              ვალუტები <small className="muted">(ადმინის სიიდან)</small>
            </label>
            <div className="curlist2">
              {currencies.map((c) => {
                const on = cs.includes(c.Code);
                const ks = p?.Cards.filter((k) => k.Currency === c.Code) ?? [];
                const isOpen = !!p && on && openCur.has(c.Code);
                return (
                  <div key={c.Code} className={`cursec${isOpen ? ' open' : ''}`}>
                    <div className="currow2">
                      <label className="cb">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={async (e) => {
                            const next = e.target.checked ? [...cs, c.Code] : cs.filter((x) => x !== c.Code);
                            setCurs(next);
                            if (p) await save(next, true); // on the edit page a currency switch is saved right away
                          }}
                        />
                        <i />
                      </label>
                      <b>{c.Code}</b>
                      <span className="muted">{c.Symbol}</span>
                      <small>{on && p ? cardsLabel(ks.length) : ''}</small>
                      <span className="rowacts">
                        <button
                          type="button"
                          className="btn btn-ghost sm"
                          disabled={!on || busy}
                          onClick={() => {
                            setOpenCur(new Set(openCur).add(c.Code));
                            setCard({ cur: c.Code, k: null });
                          }}
                        >
                          + შეთავაზება
                        </button>
                        {p && (
                          <button
                            type="button"
                            className="ib tg"
                            aria-label="ჩამოშლა"
                            disabled={!on}
                            onClick={() => {
                              const n = new Set(openCur);
                              if (n.has(c.Code)) n.delete(c.Code);
                              else n.add(c.Code);
                              setOpenCur(n);
                            }}
                          >
                            <Chevron />
                          </button>
                        )}
                      </span>
                    </div>
                    {p && on && (
                      <div className="cbody">
                        {ks.length ? (
                          ks.map((k) => (
                            <div key={k.ID} className="crow">
                              <CardInfo p={p} k={k} />
                              <span className="racts p">
                                <Switch
                                  on={k.IsEnable}
                                  onChange={async (v) => {
                                    try {
                                      await crud('partner', 'card').enable(k, v);
                                      toast(v ? 'შეთავაზების ტიპი ჩაირთო' : 'შეთავაზების ტიპი გამოირთო');
                                      refresh();
                                    } catch (e) {
                                      toast(errText(e));
                                    }
                                  }}
                                />
                                <button type="button" className="ib edit" title="რედაქტირება" aria-label="რედაქტირება" onClick={() => setCard({ cur: c.Code, k })}>
                                  <EditIcon />
                                </button>
                              </span>
                            </div>
                          ))
                        ) : (
                          <div className="empty small">შეთავაზების ტიპი არ არის</div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <ErrorLine error={error} />
          <div className="fbtns">
            <button
              type="button"
              className="btn btn-green"
              disabled={busy}
              onClick={async () => {
                const r = await save();
                if (r) onBack();
              }}
            >
              შენახვა
            </button>
            <button type="button" className="btn btn-ghost" onClick={onBack}>
              გაუქმება
            </button>
          </div>
        </div>
      </div>
      {card && p && <CardDialog p={p} cur={card.cur} k={card.k} onClose={() => setCard(null)} onSaved={() => (setCard(null), refresh())} />}
    </div>
  );
}

const RANGE_LABELS: Record<string, string> = { Amt: 'თანხა', M: 'ვადა', Monthly: 'ყოველთვიური გადასახდელი' };
const PAIRS: [string, string, string][] = [
  ['rate', 'effRate', 'წლიური საპროცენტო / ეფექტური'],
  ['feePct', 'feeMin', 'ერთჯერადი საკომისიო'],
  ['insPct', 'insMin', 'დაზღვევა (თვეში)'],
];

/** Offer type dialog (#dlg2): offer type + fields from the product type schema; min/max and pairs on one line. */
export function CardDialog({ p, cur, k, onClose, onSaved }: { p: Product; cur: string; k: CardRow | null; onClose: () => void; onSaved: () => void }) {
  const { fields, offerTypes } = useRefs();
  const toast = useToast();
  const fs = fields.filter((f) => f.ProductTypeID === p.ProductTypeID);
  const [ot, setOt] = useState<number>(k?.OfferTypeID ?? offerTypes[0]?.ID ?? 0);
  const [vals, setVals] = useState<Record<string, Val>>(() => Object.fromEntries(fs.map((f) => [f.Key, k ? k.Values[pk(f.Key)] ?? null : f.DefaultValue])));
  const [active, setActive] = useState(k?.IsEnable ?? true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const ctl = (f: Field) => {
    const v = vals[f.Key];
    const set = (x: Val) => setVals((o) => ({ ...o, [f.Key]: x }));
    if (f.Kind === 'select')
      return (
        <select value={String(v ?? '')} onChange={(e) => set(e.target.value)}>
          {(f.Options ?? []).map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      );
    if (f.Kind === 'bool') return <Switch on={!!v} onChange={set} />;
    const unit = f.Kind === 'money' ? curSym(cur) : ((f.LabelKa.match(/,\s*(.+)$/) ?? [])[1] ?? '').replace('% თვეში', '%');
    const pre = /^min[A-Z]/.test(f.Key) && PAIRS.some((x) => x[1] === f.Key) ? 'მინ.' : '';
    return (
      <span className={`ui${pre ? ' pre' : ''}`}>
        {pre && <i>{pre}</i>}
        <input type="number" min={0} step={f.Step ?? 1} value={v === null || v === undefined ? '' : String(v)} onChange={(e) => set(e.target.value === '' ? null : Number(e.target.value))} />
        {unit && <b>{unit}</b>}
      </span>
    );
  };
  const rows: React.ReactNode[] = [];
  for (const f of fs) {
    const pair = PAIRS.find((x) => x[0] === f.Key);
    const f2 = pair && fs.find((x) => x.Key === pair[1]);
    if (pair && f2) {
      rows.push(
        <div key={f.Key} className="frow">
          <label>{pair[2]}:</label>
          <div className="rng">
            {ctl(f)}
            <span />
            {ctl(f2)}
          </div>
        </div>,
      );
      continue;
    }
    if (PAIRS.some((x) => x[1] === f.Key && fs.some((y) => y.Key === x[0]))) continue;
    if (f.Key.startsWith('min')) {
      const suf = f.Key.slice(3);
      const mx = fs.find((x) => x.Key === `max${suf}`);
      if (mx) {
        rows.push(
          <div key={f.Key} className="frow">
            <label>{RANGE_LABELS[suf] ?? f.LabelKa.replace(/:.*$/, '')}:</label>
            <div className="rng">
              {ctl(f)}
              <span>–</span>
              {ctl(mx)}
            </div>
          </div>,
        );
        continue;
      }
    }
    if (f.Key.startsWith('max') && fs.some((x) => x.Key === `min${f.Key.slice(3)}`)) continue;
    rows.push(
      <div key={f.Key} className="frow">
        <label>{f.LabelKa.replace(/,\s*.+$/, '')}:</label>
        <div className={f.Kind === 'bool' ? 'rng' : 'one'}>{ctl(f)}</div>
      </div>,
    );
  }

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const body = { ProductID: p.ID, OfferTypeID: ot, Currency: cur, Values: Object.fromEntries(Object.entries(vals).map(([key, v]) => [pk(key), v])) };
      const api = crud('partner', 'card');
      if (k) {
        await api.edit(k, body);
        if (active !== k.IsEnable) await api.enable(k, active);
      } else await api.add(body);
      toast(k ? 'შეთავაზება შეინახა' : 'შეთავაზება დაემატა');
      onSaved();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };
  const remove = async (r: Ref) => {
    if (!confirm(`წავშალოთ შეთავაზება (${cur})?`)) return;
    try {
      await crud('partner', 'card').remove(r);
      toast('შეთავაზება წაიშალა');
      onSaved();
    } catch (e) {
      setError(errText(e));
    }
  };

  return (
    <Modal title={`${p.ProductType.NameKa} · ${cur}`} onClose={onClose}>
      <div className="form f main-form">
        <div className="frow">
          <label htmlFor="kType">შეთავაზების ტიპი:</label>
          <div className="one">
            <select id="kType" value={ot} onChange={(e) => setOt(Number(e.target.value))}>
              {offerTypes.map((o) => (
                <option key={o.ID} value={o.ID}>
                  {o.NameKa}
                </option>
              ))}
            </select>
          </div>
        </div>
        {rows}
        {k && (
          <div className="fld">
            <label className="chk">
              <Switch on={active} onChange={setActive} /> აქტიური
            </label>
          </div>
        )}
        <ErrorLine error={error} />
        <div className="fbtns">
          <button type="button" className="btn btn-green" disabled={busy} onClick={save}>
            {k ? 'შენახვა' : 'დამატება'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            დახურვა
          </button>
          {k && (
            <button type="button" className="btn btn-red" style={{ marginInlineStart: 'auto' }} onClick={() => remove(k)}>
              წაშლა
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
