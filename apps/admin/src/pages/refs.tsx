import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ApiError, Base } from '../api/client';
import { useAll, useFind, useRowActions } from '../api/hooks';
import { useAuth } from '../auth/auth';
import { REF_PANELS } from '../layout/menu';
import { ArrowsCell, BiInput, BiView, RowActions, slug, Switch } from '../ui/controls';
import { Confirm, Dialog, FieldError, FieldErrors } from '../ui/dialog';
import { DataTable, ListPage, Pager, StateRow, usePageSize } from '../ui/list-page';
import { useToast } from '../ui/toast';

// Reference lists (prototype renderRefs): one page per panel, add/edit in a dialog, ↑↓ order, active switch.

interface Named extends Base {
  Code: string;
  NameKa: string;
  NameEn: string;
  Sort: number;
}
interface Currency extends Base {
  Code: string;
  Symbol: string;
  Sort: number;
}
interface City extends Named {
  RegionID: number;
}
interface District extends Named {
  CityID: number;
}
type Row = Named & Partial<Currency & City & District>;

const NOTE: Record<string, string> = {
  currencies: 'პროდუქტზე ჩართვადი ვალუტები; კოდი + სიმბოლო',
  offerTypes: 'პარტნიორის შეთავაზების ტიპები (ბარათის ტიპი)',
  regions: 'ქალაქების ჯგუფები ლოკაციის ფილტრისთვის; ქალაქი რეგიონს ეკუთვნის',
  cities: 'ლოკაციის ფილტრი და ვიზარდი; ქალაქი რეგიონით',
  districts: 'დიდი ქალაქების უბნები — ლოკაციის ჩაშლა',
  rejectReasons: 'პარტნიორი უარს ეუბნება შემოსულ / განხილვაში განაცხადს',
  cancelReasons: 'პარტნიორი აუქმებს გაგზავნილ / დადასტურებულ შეთავაზებას',
  sectors: 'ვიზარდის მე-2 ნაბიჯი — საქმიანობის სფერო',
  incomes: 'ვიზარდის მე-3 ნაბიჯი — შემოსავლის წყარო',
  creditHistory: 'ვიზარდის 1-ლი ნაბიჯი — საკრედიტო ისტორია',
};

export function RefsPage() {
  const { key = 'currencies' } = useParams();
  const panel = REF_PANELS.find((p) => p.key === key) ?? REF_PANELS[0];
  // remount per panel so paging / filters reset
  return <RefList key={panel.key} panelKey={panel.key} module={panel.module} title={panel.label} />;
}

function RefList({ panelKey, module, title }: { panelKey: string; module: string; title: string }) {
  const { canWrite } = useAuth();
  const toast = useToast();
  const [size, setSize] = usePageSize();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [group, setGroup] = useState<number | ''>('');
  const [dialog, setDialog] = useState<{ row: Row | null } | null>(null);
  const [del, setDel] = useState<Row | null>(null);

  const isCurrency = panelKey === 'currencies';
  const groupField = panelKey === 'cities' ? 'RegionID' : panelKey === 'districts' ? 'CityID' : null;
  const regions = useAll<Named>('region');
  const cities = useAll<City>('city');
  const groups = panelKey === 'cities' ? regions.data : panelKey === 'districts' ? cities.data : undefined;
  const groupName = (id?: number) => groups?.find((g) => g.ID === id);

  const body = {
    Filter: { ...(search ? { Search: search } : {}), ...(groupField && group !== '' ? { [groupField]: group } : {}) },
    Sort: [...(groupField ? [{ Field: groupField, Dir: 'asc' }] : []), { Field: 'Sort', Dir: 'asc' }],
  };
  const q = useFind<Row>(module, page, size, body);
  const act = useRowActions(module, groupField ? ['region', 'city'] : []);
  const writable = canWrite(module);
  useEffect(() => setPage(1), [search, group, size]);

  const rows = q.data?.Items ?? [];
  const offset = (page - 1) * size;
  const total = q.data?.TotalCount ?? 0;
  const cols = isCurrency ? ['კოდი', 'სიმბოლო'] : ['დასახელება', 'კოდი', ...(panelKey === 'cities' ? ['რეგიონი', 'უბანი'] : panelKey === 'districts' ? ['ქალაქი'] : [])];
  const districts = useAll<District>('district', {}).data;

  return (
    <ListPage
      title={`ცნობარები · ${title}`}
      desc={`${NOTE[panelKey] ?? ''}. პარტნიორი მხოლოდ ირჩევს, ადმინი მართავს; სია რიგით ლაგდება (↑↓).`}
      add={writable && <button type="button" className="btn btn-green" onClick={() => setDialog({ row: null })}>+ დამატება</button>}
      filters={
        <>
          <input className="search" type="search" placeholder="ძებნა" value={search} onChange={(e) => setSearch(e.target.value)} />
          {groups && (
            <select aria-label={panelKey === 'cities' ? 'რეგიონი' : 'ქალაქი'} value={group} onChange={(e) => setGroup(e.target.value ? Number(e.target.value) : '')}>
              <option value="">{panelKey === 'cities' ? 'ყველა რეგიონი' : 'ყველა ქალაქი'}</option>
              {groups.map((g) => (
                <option key={g.ID} value={g.ID}>
                  {g.NameKa}
                </option>
              ))}
            </select>
          )}
        </>
      }
      foot={<Pager page={page} totalPages={q.data?.TotalPages ?? 1} size={size} onPage={setPage} onSize={setSize} />}
    >
      <DataTable
        className="fill"
        head={
          <tr>
            {cols.map((c) => (
              <th key={c}>{c}</th>
            ))}
            <th className="w2">აქტიური</th>
            <th className="w2 num">რიგი</th>
            <th className="acts" />
          </tr>
        }
      >
        {rows.length === 0 ? (
          <StateRow span={cols.length + 3} loading={q.isLoading} error={q.error?.message} />
        ) : (
          rows.map((r, i) => {
            // ↑↓ only inside the same group (region / city) — the API reorders within it
            const sameAsPrev = !groupField || rows[i - 1]?.[groupField as 'RegionID'] === r[groupField as 'RegionID'];
            const sameAsNext = !groupField || rows[i + 1]?.[groupField as 'RegionID'] === r[groupField as 'RegionID'];
            const first = offset + i === 0 || (i === 0 && !!groupField) || !sameAsPrev;
            const last = offset + i === total - 1 || (i === rows.length - 1 && !!groupField) || !sameAsNext;
            return (
              <tr key={r.ID} className={r.IsEnable ? '' : 'inactive'}>
                {isCurrency ? (
                  <>
                    <td>
                      <code>{r.Code}</code>
                    </td>
                    <td>{r.Symbol}</td>
                  </>
                ) : (
                  <>
                    <td>
                      <BiView ka={r.NameKa} en={r.NameEn} />
                    </td>
                    <td>
                      <code>{r.Code}</code>
                    </td>
                    {panelKey === 'cities' && (
                      <>
                        <td>{groupName(r.RegionID) && <BiView ka={groupName(r.RegionID)!.NameKa} en={groupName(r.RegionID)!.NameEn} />}</td>
                        <td>{districts?.filter((d) => d.CityID === r.ID).length || '—'}</td>
                      </>
                    )}
                    {panelKey === 'districts' && <td>{groupName(r.CityID)?.NameKa}</td>}
                  </>
                )}
                <td>
                  <Switch checked={r.IsEnable} disabled={!writable} onChange={(on) => act.enable.mutate({ r, on }, { onSuccess: () => toast(on ? 'ჩაირთო' : 'გამოირთო') })} />
                </td>
                <ArrowsCell
                  index={first ? 0 : 1}
                  count={last ? 2 : 3}
                  disabled={!writable || act.move.isPending}
                  onMove={(dir) => act.move.mutate({ r, dir }, { onError: (e) => toast(e.message) })}
                />
                {writable ? <RowActions onEdit={() => setDialog({ row: r })} onDelete={() => setDel(r)} /> : <td className="acts" />}
              </tr>
            );
          })
        )}
      </DataTable>
      {dialog && (
        <RefDialog
          title={title}
          panelKey={panelKey}
          row={dialog.row}
          regions={regions.data ?? []}
          cities={cities.data ?? []}
          defaultGroup={group}
          onSave={async (b) => {
            await act.save(dialog.row, b);
            toast(dialog.row ? 'შენახულია' : 'დაემატა');
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {del && (
        <Confirm
          title={`წავშალოთ „${del.NameKa ?? del.Code}"?`}
          text="ჩანაწერი ამოვარდება ცნობარიდან."
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

function RefDialog({
  title, panelKey, row, regions, cities, defaultGroup, onSave, onClose,
}: {
  title: string;
  panelKey: string;
  row: Row | null;
  regions: Named[];
  cities: City[];
  defaultGroup: number | '';
  onSave: (body: object) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState({ ka: row?.NameKa ?? '', en: row?.NameEn ?? '' });
  const [code, setCode] = useState(row?.Code ?? '');
  const [manualCode, setManualCode] = useState(!!row?.Code);
  const [symbol, setSymbol] = useState(row?.Symbol ?? '');
  const [regionId, setRegionId] = useState<number | ''>(row?.RegionID ?? (panelKey === 'cities' ? defaultGroup : '') ?? '');
  const [cityId, setCityId] = useState<number | ''>(row?.CityID ?? (panelKey === 'districts' ? defaultGroup : '') ?? '');
  const [errors, setErrors] = useState<FieldErrors>({});

  const isCurrency = panelKey === 'currencies';
  const label = { regions: 'რეგიონი', cities: 'ქალაქი', districts: 'უბანი' }[panelKey] ?? 'დასახელება';

  const submit = async () => {
    if (isCurrency) return onSave({ Code: code.trim().toUpperCase(), Symbol: symbol.trim(), Sort: row?.Sort ?? 0 });
    if (!name.ka.trim()) throw new ApiError(400, 'VALIDATION_ERROR', 'დასახელება სავალდებულოა');
    const b: Record<string, unknown> = { NameKa: name.ka, NameEn: name.en || name.ka, Code: code, Sort: row?.Sort ?? 0 };
    if (panelKey === 'cities') b.RegionID = regionId;
    if (panelKey === 'districts') b.CityID = cityId;
    return onSave(b);
  };

  return (
    <Dialog title={`${title} — ${row ? 'რედაქტირება' : 'დამატება'}`} okLabel={row ? 'შენახვა' : 'დამატება'} onOk={submit} onClose={onClose} onErrors={setErrors}>
      {isCurrency ? (
        <div className="fgrid" style={{ padding: 0 }}>
          <div className="f">
            <label htmlFor="nA">კოდი</label>
            <input id="nA" value={code} maxLength={3} placeholder="მაგ. GBP" required onChange={(e) => setCode(e.target.value.toUpperCase())} />
            <FieldError errors={errors} field="Code" />
          </div>
          <div className="f">
            <label htmlFor="nB">სიმბოლო</label>
            <input id="nB" value={symbol} placeholder="£" required onChange={(e) => setSymbol(e.target.value)} />
            <FieldError errors={errors} field="Symbol" />
          </div>
        </div>
      ) : (
        <>
          {panelKey === 'cities' && (
            <div className="f">
              <label htmlFor="nReg">რეგიონი</label>
              <select id="nReg" value={regionId} required onChange={(e) => setRegionId(Number(e.target.value))}>
                <option value="" />
                {regions.map((r) => (
                  <option key={r.ID} value={r.ID}>
                    {r.NameKa} · {r.NameEn}
                  </option>
                ))}
              </select>
              <FieldError errors={errors} field="RegionID" />
            </div>
          )}
          {panelKey === 'districts' && (
            <div className="f">
              <label htmlFor="nCity">ქალაქი</label>
              <select id="nCity" value={cityId} required onChange={(e) => setCityId(Number(e.target.value))}>
                <option value="" />
                {cities.map((c) => (
                  <option key={c.ID} value={c.ID}>
                    {c.NameKa}
                  </option>
                ))}
              </select>
              <FieldError errors={errors} field="CityID" />
            </div>
          )}
          <div className="f">
            <label>{label}</label>
            <BiInput
              value={name}
              placeholder={label}
              onChange={(v) => {
                setName(v);
                // the code follows the English name until edited by hand
                if (!manualCode) setCode(slug(v.en));
              }}
            />
            <FieldError errors={errors} field="NameKa" />
          </div>
          <div className="f">
            <label htmlFor="fCode">კოდი</label>
            <input id="fCode" value={code} placeholder="მაგ. private_sector" required onChange={(e) => (setCode(e.target.value), setManualCode(!!e.target.value))} />
            <small>lowercase ინგლისური, სიტყვებს შორის _; ინგლისური დასახელებიდან ივსება</small>
            <FieldError errors={errors} field="Code" />
          </div>
        </>
      )}
    </Dialog>
  );
}
