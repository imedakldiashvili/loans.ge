import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiError, Base, crud } from '../api/client';
import { useAll, useFind, useInvalidate, useRowActions } from '../api/hooks';
import { useAuth } from '../auth/auth';
import { ArrowsCell, BiInput, BiView, fmt, RowActions, slug, Switch } from '../ui/controls';
import { Confirm, Dialog, FieldError, FieldErrors } from '../ui/dialog';
import { Icon } from '../ui/icons';
import { DataTable, ListPage, Pager, StateRow, usePageSize } from '../ui/list-page';
import { useToast } from '../ui/toast';

// Product types and the offer field schema of each type (prototype renderProducts / productPage / fieldDialog).

interface ProductType extends Base {
  Code: string;
  NameKa: string;
  NameEn: string;
  MinAmount: number;
  MaxAmount: number;
  MinMonths: number | null;
  MaxMonths: number | null;
  NoTerm: boolean;
  AmountRanges: number[];
  Sort: number;
}
interface Field extends Base {
  ProductTypeID: number;
  Key: string;
  LabelKa: string;
  LabelEn: string;
  Kind: 'number' | 'money' | 'int' | 'select' | 'bool';
  DefaultValue: number | string | boolean | null;
  Step: number | null;
  Options: string[] | null;
  Sort: number;
}
interface OrgPt extends Base {
  ProductTypeID: number;
}

const RANGES = [100, 1000, 10000, 100000];
const KINDS: Record<Field['Kind'], string> = { number: 'რიცხვი', money: 'თანხა', int: 'მთელი', select: 'არჩევანი', bool: 'კი/არა' };

export function ProductsPage() {
  const { canWrite } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [size, setSize] = usePageSize();
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<{ row: ProductType | null } | null>(null);
  const [del, setDel] = useState<ProductType | null>(null);
  useEffect(() => setPage(1), [size]);

  const q = useFind<ProductType>('productType', page, size, { Sort: [{ Field: 'Sort', Dir: 'asc' }] });
  const fields = useAll<Field>('productTypeField');
  const links = useAll<OrgPt>('organizationProductType');
  const act = useRowActions('productType');
  const writable = canWrite('productType');
  const rows = q.data?.Items ?? [];

  return (
    <ListPage
      title="პროდუქტის ტიპები"
      desc="ცნობარი, რომლიდანაც პარტნიორი პროდუქტს ირჩევს (თავისუფალი სახელი არ არის). თითო ტიპს აქვს შეთავაზების ველების სქემა — რა ივსება შეთავაზების ტიპში პარტნიორის კაბინეტში."
      add={writable && <button type="button" className="btn btn-green" onClick={() => setDialog({ row: null })}>+ პროდუქტის ტიპი</button>}
      foot={<Pager page={page} totalPages={q.data?.TotalPages ?? 1} size={size} onPage={setPage} onSize={setSize} />}
    >
      <DataTable
        className="wide"
        head={
          <tr>
            <th className="w3">კოდი</th>
            <th>პროდუქტის ტიპი</th>
            <th className="w5">თანხები/ვადები</th>
            <th>სწრაფი ფორმის დიაპაზონები</th>
            <th className="num w1">ველი</th>
            <th className="num w3">ორგანიზაცია</th>
            <th className="w2">აქტიური</th>
            <th className="w2 num">რიგი</th>
            <th className="acts" style={{ width: 136 }} />
          </tr>
        }
      >
        {rows.length === 0 ? (
          <StateRow span={9} loading={q.isLoading} error={q.error?.message} />
        ) : (
          rows.map((p, i) => (
            <tr key={p.ID} className={p.IsEnable ? '' : 'inactive'}>
              <td>
                <code>{p.Code}</code>
              </td>
              <td>
                <BiView ka={p.NameKa} en={p.NameEn} />
              </td>
              {/* amounts above, terms below */}
              <td style={{ whiteSpace: 'nowrap' }}>
                <div>
                  {fmt(p.MinAmount)}–{fmt(p.MaxAmount)} ₾
                </div>
                <div style={{ marginTop: 4 }}>{p.NoTerm ? <span className="tag grey">უვადო</span> : <small style={{ color: 'var(--muted)' }}>{`${p.MinMonths ?? 0}–${p.MaxMonths ?? 0} თვე`}</small>}</div>
              </td>
              <td>
                <div className="chips">
                  {RANGES.map((r) => (
                    <span key={r} className={`chip ${p.AmountRanges.includes(r) ? 'on' : 'off'}`}>
                      {fmt(r)}+
                    </span>
                  ))}
                </div>
              </td>
              <td className="num">{(fields.data ?? []).filter((f) => f.ProductTypeID === p.ID).length}</td>
              <td className="num">{(links.data ?? []).filter((l) => l.ProductTypeID === p.ID).length}</td>
              <td>
                <Switch checked={p.IsEnable} disabled={!writable} onChange={(on) => act.enable.mutate({ r: p, on }, { onSuccess: () => toast('შენახულია') })} />
              </td>
              <ArrowsCell index={(page - 1) * size + i} count={q.data?.TotalCount ?? 0} disabled={!writable || act.move.isPending} onMove={(dir) => act.move.mutate({ r: p, dir })} />
              <RowActions onEdit={writable ? () => setDialog({ row: p }) : undefined} onDelete={writable ? () => setDel(p) : undefined}>
                <button type="button" className="ib" title="შეთავაზების ველები" onClick={() => nav(`/products/${p.ID}/${p.UID}`)}>
                  <Icon.list />
                </button>
              </RowActions>
            </tr>
          ))
        )}
      </DataTable>
      {dialog && <ProductDialog row={dialog.row} onClose={() => setDialog(null)} />}
      {del && (
        <Confirm
          title={`წავშალოთ „${del.NameKa}"?`}
          text="ტიპი ამოვარდება ორგანიზაციების სიებიდანაც."
          onOk={async () => {
            await act.remove(del);
            toast('წაშლილია');
          }}
          onClose={() => setDel(null)}
        />
      )}
    </ListPage>
  );
}

function ProductDialog({ row, onClose }: { row: ProductType | null; onClose: () => void }) {
  const toast = useToast();
  const invalidate = useInvalidate();
  const [name, setName] = useState({ ka: row?.NameKa ?? '', en: row?.NameEn ?? '' });
  const [min, setMin] = useState(String(row?.MinAmount ?? 100));
  const [max, setMax] = useState(String(row?.MaxAmount ?? 10000));
  const [minM, setMinM] = useState(String(row?.MinMonths ?? 3));
  const [maxM, setMaxM] = useState(String(row?.MaxMonths ?? 36));
  const [noTerm, setNoTerm] = useState(row?.NoTerm ?? false);
  const [ranges, setRanges] = useState<number[]>(row?.AmountRanges ?? [100, 1000]);
  const [errors, setErrors] = useState<FieldErrors>({});

  const save = async () => {
    if (!name.ka.trim()) throw new ApiError(400, 'VALIDATION_ERROR', 'დასახელება სავალდებულოა');
    const body = {
      Code: row?.Code ?? slug(name.en || name.ka) ?? '', NameKa: name.ka, NameEn: name.en || name.ka,
      MinAmount: Number(min), MaxAmount: Number(max),
      MinMonths: noTerm ? null : Number(minM) || null, MaxMonths: noTerm ? null : Number(maxM) || null,
      NoTerm: noTerm, AmountRanges: [...ranges].sort((a, b) => a - b), Sort: row?.Sort ?? 0,
    };
    if (row) await crud.edit('productType', row, body);
    else await crud.add('productType', body);
    await invalidate('productType');
    toast(row ? 'შენახულია' : 'დაემატა');
  };

  return (
    <Dialog title={row ? `პროდუქტის ტიპის რედაქტირება · ${row.Code}` : 'ახალი პროდუქტის ტიპი'} okLabel={row ? 'შენახვა' : 'დამატება'} onOk={save} onClose={onClose} onErrors={setErrors}>
      <div className="f">
        <label>დასახელება</label>
        <BiInput value={name} onChange={setName} placeholder="მაგ. სტუდენტური სესხი" />
        <FieldError errors={errors} field="Code" />
      </div>
      <div className="fgrid" style={{ padding: 0 }}>
        <div className="f">
          <label htmlFor="nMin">მინ. თანხა, ₾</label>
          <input type="number" id="nMin" min={0} step={100} value={min} onChange={(e) => setMin(e.target.value)} />
        </div>
        <div className="f">
          <label htmlFor="nMax">მაქს. თანხა, ₾</label>
          <input type="number" id="nMax" min={0} step={100} value={max} onChange={(e) => setMax(e.target.value)} />
          <FieldError errors={errors} field="MaxAmount" />
        </div>
      </div>
      <div className="fgrid" style={{ padding: 0 }}>
        <div className="f">
          <label htmlFor="nMinM">ვადა: დან, თვე</label>
          <input type="number" id="nMinM" min={1} value={minM} disabled={noTerm} onChange={(e) => setMinM(e.target.value)} />
        </div>
        <div className="f">
          <label htmlFor="nMaxM">ვადა: მდე, თვე</label>
          <input type="number" id="nMaxM" min={1} value={maxM} disabled={noTerm} onChange={(e) => setMaxM(e.target.value)} />
          <FieldError errors={errors} field="MaxMonths" />
        </div>
        <div className="f">
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 28 }}>
            <Switch checked={noTerm} onChange={setNoTerm} /> უვადო
          </label>
        </div>
      </div>
      <div className="f">
        <label>სწრაფი ფორმის დიაპაზონები</label>
        <div className="checks">
          {RANGES.map((r) => (
            <label key={r}>
              <input type="checkbox" checked={ranges.includes(r)} onChange={(e) => setRanges((v) => (e.target.checked ? [...v, r] : v.filter((x) => x !== r)))} />
              {fmt(r)}+
            </label>
          ))}
        </div>
        <small>შეთავაზების ველები — სიიდან ☰ ღილაკით</small>
      </div>
    </Dialog>
  );
}

/** Offer field schema of one product type — separate page. */
export function ProductFieldsPage() {
  const { id = '', uid = '' } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { canWrite } = useAuth();
  const writable = canWrite('productTypeField');
  const pt = useAll<ProductType>('productType').data?.find((p) => p.ID === Number(id) && p.UID === uid);
  const q = useFind<Field>('productTypeField', 1, 100, { Filter: { ProductTypeID: Number(id) }, Sort: [{ Field: 'Sort', Dir: 'asc' }] });
  const act = useRowActions('productTypeField');
  const [dialog, setDialog] = useState<{ row: Field | null } | null>(null);
  const [del, setDel] = useState<Field | null>(null);
  const list = q.data?.Items ?? [];

  const detail = (f: Field) =>
    f.Kind === 'select' ? ' · ' + (f.Options ?? []).join(' / ') : f.Kind === 'bool' ? ' · ნაგულისხმევი: ' + (f.DefaultValue ? 'კი' : 'არა') : f.DefaultValue !== null ? ' · ნაგულისხმევი: ' + f.DefaultValue : '';

  return (
    <ListPage
      title={`${pt?.NameKa ?? ''} · შეთავაზების ველები`}
      desc={`ამ თანმიმდევრობით ივსება პარტნიორის კაბინეტში · ${pt?.Code ?? ''}`}
      back={{ label: 'პროდუქტის ტიპები', onClick: () => nav('/products') }}
      add={writable && <button type="button" className="btn btn-green" onClick={() => setDialog({ row: null })}>+ ველი</button>}
    >
      <div className="tbl">
        {list.length === 0 ? (
          <div className="empty">{q.isLoading ? 'იტვირთება…' : 'ველი არ არის — შეთავაზების ფორმა ცარიელი იქნება'}</div>
        ) : (
          list.map((f, i) => (
            <div className="frow" key={f.ID}>
              <span className="ord">{i + 1}</span>
              <span>
                <BiView ka={f.LabelKa} en={f.LabelEn} />
                <span className="k">
                  <code>{f.Key}</code>
                  {detail(f)}
                  {f.Step ? ' · ბიჯი ' + f.Step : ''}
                </span>
              </span>
              <span className="kind">{KINDS[f.Kind]}</span>
              <span style={{ whiteSpace: 'nowrap' }}>
                <button type="button" className="ib" title="ზემოთ" disabled={!writable || i === 0} onClick={() => act.move.mutate({ r: f, dir: 'up' })}>
                  <Icon.up />
                </button>{' '}
                <button type="button" className="ib" title="ქვემოთ" disabled={!writable || i === list.length - 1} onClick={() => act.move.mutate({ r: f, dir: 'down' })}>
                  <Icon.down />
                </button>
                {writable && (
                  <>
                    {' '}
                    <button type="button" className="ib" title="რედაქტირება" onClick={() => setDialog({ row: f })}>
                      <Icon.edit />
                    </button>{' '}
                    <button type="button" className="ib danger" title="წაშლა" onClick={() => setDel(f)}>
                      <Icon.del />
                    </button>
                  </>
                )}
              </span>
            </div>
          ))
        )}
      </div>
      {dialog && (
        <FieldDialog
          row={dialog.row}
          onSave={async (body) => {
            await act.save(dialog.row, { ...body, ProductTypeID: Number(id) });
            toast(dialog.row ? 'შენახულია' : 'ველი დაემატა');
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {del && (
        <Confirm
          title={`წავშალოთ ველი „${del.LabelKa}"?`}
          text="ველი ამოვარდება შეთავაზების ფორმიდან."
          onOk={async () => {
            await act.remove(del);
            toast('ველი წაიშალა');
          }}
          onClose={() => setDel(null)}
        />
      )}
    </ListPage>
  );
}

function FieldDialog({ row, onSave, onClose }: { row: Field | null; onSave: (b: object) => Promise<void>; onClose: () => void }) {
  const [key, setKey] = useState(row?.Key ?? '');
  const [kind, setKind] = useState<Field['Kind']>(row?.Kind ?? 'number');
  const [label, setLabel] = useState({ ka: row?.LabelKa ?? '', en: row?.LabelEn ?? '' });
  const [def, setDef] = useState(row?.Kind === 'bool' ? (row.DefaultValue ? 'კი' : 'არა') : String(row?.DefaultValue ?? ''));
  const [step, setStep] = useState(String(row?.Step ?? ''));
  const [options, setOptions] = useState((row?.Options ?? []).join(', '));
  const [errors, setErrors] = useState<FieldErrors>({});

  const save = () => {
    const opts = options.split(',').map((s) => s.trim()).filter(Boolean);
    const dv = def.trim();
    const DefaultValue =
      kind === 'bool' ? /^(კი|true|1|yes)$/i.test(dv) : kind === 'select' ? (opts.includes(dv) ? dv : opts[0] ?? null) : dv === '' ? null : kind === 'int' ? Math.round(Number(dv)) : Number(dv);
    return onSave({
      Key: key.trim(), Kind: kind, LabelKa: label.ka, LabelEn: label.en || label.ka, DefaultValue,
      Step: (kind === 'number' || kind === 'money') && Number(step) ? Number(step) : null,
      Options: kind === 'select' ? opts : null, Sort: row?.Sort ?? 0,
    });
  };

  return (
    <Dialog title={row ? 'ველის რედაქტირება' : 'ახალი ველი'} onOk={save} onClose={onClose} onErrors={setErrors}>
      <div className="fgrid" style={{ padding: 0 }}>
        <div className="f">
          <label htmlFor="fKey">გასაღები (key)</label>
          <input id="fKey" value={key} placeholder="მაგ. downPct" required onChange={(e) => setKey(e.target.value)} />
          <small>ლათინური, ასე ინახება შეთავაზებაში</small>
          <FieldError errors={errors} field="Key" />
        </div>
        <div className="f">
          <label htmlFor="fKind">ტიპი</label>
          <select id="fKind" value={kind} onChange={(e) => setKind(e.target.value as Field['Kind'])}>
            {Object.entries(KINDS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="f">
        <label>ლეიბლი</label>
        <BiInput value={label} onChange={setLabel} placeholder="მაგ. თანამონაწილეობა, %" />
        <FieldError errors={errors} field="LabelKa" />
      </div>
      <div className="fgrid" style={{ padding: 0 }}>
        <div className="f">
          <label htmlFor="fDef">ნაგულისხმევი</label>
          <input id="fDef" value={def} placeholder={kind === 'bool' ? 'კი / არა' : ''} onChange={(e) => setDef(e.target.value)} />
        </div>
        {(kind === 'number' || kind === 'money') && (
          <div className="f">
            <label htmlFor="fStep">ბიჯი</label>
            <input id="fStep" type="number" step="any" value={step} placeholder="მაგ. 0.1" onChange={(e) => setStep(e.target.value)} />
          </div>
        )}
      </div>
      {kind === 'select' && (
        <div className="f">
          <label htmlFor="fOpt">ვარიანტები (მძიმით)</label>
          <input id="fOpt" value={options} placeholder="ანუიტეტი, კლებადი" onChange={(e) => setOptions(e.target.value)} />
          <FieldError errors={errors} field="Options" />
        </div>
      )}
    </Dialog>
  );
}
