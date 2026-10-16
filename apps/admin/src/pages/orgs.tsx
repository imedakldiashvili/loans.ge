import { useEffect, useState } from 'react';
import { api, ApiError, Base, crud, upload } from '../api/client';
import { useAll, useFind, useInvalidate, useRowActions } from '../api/hooks';
import { useAuth } from '../auth/auth';
import { ArrowsCell, BiInput, BiView, RowActions, Switch } from '../ui/controls';
import { Confirm, Dialog, FieldError, FieldErrors } from '../ui/dialog';
import { DataTable, ListPage, Pager, StateRow, usePageSize } from '../ui/list-page';
import { useToast } from '../ui/toast';
import { CATEGORIES, OrgMark } from './common';

// Organisations (prototype renderOrgs / orgDialog).

interface Org extends Base {
  NameKa: string;
  NameEn: string;
  Category: string;
  Color: string | null;
  LogoPath: string | null;
  IsPartner: boolean;
  Sort: number;
}
interface OrgPt extends Base {
  OrganizationID: number;
  ProductTypeID: number;
  ProductType: { ID: number; NameKa: string; NameEn: string };
}
interface ProductType extends Base {
  NameKa: string;
  NameEn: string;
  Sort: number;
}
interface Staff extends Base {
  OrganizationID: number;
}

export function OrgsPage() {
  const { canWrite } = useAuth();
  const toast = useToast();
  const [size, setSize] = usePageSize();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [dialog, setDialog] = useState<{ row: Org | null } | null>(null);
  const [del, setDel] = useState<Org | null>(null);
  useEffect(() => setPage(1), [search, size]);

  const q = useFind<Org>('organization', page, size, { Filter: search ? { Search: search } : {}, Sort: [{ Field: 'Sort', Dir: 'asc' }] });
  const links = useAll<OrgPt>('organizationProductType');
  const staff = useAll<Staff>('staff');
  const act = useRowActions('organization');
  const writable = canWrite('organization');
  const rows = q.data?.Items ?? [];
  const offset = (page - 1) * size;

  return (
    <ListPage
      title="ორგანიზაციები"
      desc="ბანკები, მისოები, სალიზინგოები და სუბიექტები. პარტნიორი იღებს განაცხადებს; არაპარტნიორი ბანკი მხოლოდ ვიზარდის მე-4 ნაბიჯში ჩანს („რომელი ბანკის სერვისებით სარგებლობთ“). გამორთული ორგანიზაცია არსად ჩანს და მისი თანამშრომლები ვერ შედიან."
      add={writable && <button type="button" className="btn btn-green" onClick={() => setDialog({ row: null })}>+ ორგანიზაცია</button>}
      filters={<input className="search" type="search" placeholder="ძებნა: დასახელება" value={search} onChange={(e) => setSearch(e.target.value)} />}
      foot={<Pager page={page} totalPages={q.data?.TotalPages ?? 1} size={size} onPage={setPage} onSize={setSize} />}
    >
      <DataTable
        head={
          <tr>
            <th className="w6">ორგანიზაცია</th>
            <th className="w5">კატეგორია</th>
            <th className="w4">პარტნიორი</th>
            <th>პროდუქტის ტიპები</th>
            <th className="num w4">თანამშრომელი</th>
            <th className="w2">აქტიური</th>
            <th className="w2 num">რიგი</th>
            <th className="acts" />
          </tr>
        }
      >
        {rows.length === 0 ? (
          <StateRow span={8} loading={q.isLoading} error={q.error?.message} />
        ) : (
          rows.map((o, i) => {
            const pts = (links.data ?? []).filter((l) => l.OrganizationID === o.ID);
            const st = (staff.data ?? []).filter((s) => s.OrganizationID === o.ID);
            const cat = CATEGORIES[o.Category];
            return (
              <tr key={o.ID} className={o.IsEnable ? '' : 'inactive'}>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <OrgMark org={o} cls="fl" />
                  <BiView ka={o.NameKa} en={o.NameEn} />
                </td>
                <td>{cat ? <BiView ka={cat.ka} en={cat.en} /> : o.Category}</td>
                <td>{o.IsPartner ? <span className="tag green">პარტნიორი</span> : <span className="tag grey">არა</span>}</td>
                <td>
                  <div className="chips">
                    {o.IsPartner && pts.length ? pts.map((l) => <span key={l.ID} className="chip">{l.ProductType.NameKa}</span>) : <span className="chip off">არცერთი</span>}
                  </div>
                </td>
                <td className="num">
                  {st.filter((s) => s.IsEnable).length} / {st.length}
                </td>
                <td>
                  <Switch checked={o.IsEnable} disabled={!writable} onChange={(on) => act.enable.mutate({ r: o, on }, { onSuccess: () => toast(on ? 'ორგანიზაცია ჩაირთო' : 'ორგანიზაცია გამოირთო') })} />
                </td>
                <ArrowsCell index={offset + i} count={q.data?.TotalCount ?? 0} disabled={!writable || act.move.isPending} onMove={(dir) => act.move.mutate({ r: o, dir })} />
                {writable ? <RowActions onEdit={() => setDialog({ row: o })} onDelete={() => setDel(o)} /> : <td className="acts" />}
              </tr>
            );
          })
        )}
      </DataTable>
      {dialog && <OrgDialog row={dialog.row} links={(links.data ?? []).filter((l) => l.OrganizationID === dialog.row?.ID)} onClose={() => setDialog(null)} />}
      {del && (
        <Confirm
          title={`წავშალოთ „${del.NameKa}"?`}
          text="ისტორია მონიტორინგში დარჩება, ახალ განაცხადებს ვეღარ მიიღებს."
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

function OrgDialog({ row, links, onClose }: { row: Org | null; links: OrgPt[]; onClose: () => void }) {
  const toast = useToast();
  const invalidate = useInvalidate();
  const productTypes = useAll<ProductType>('productType', { Sort: [{ Field: 'Sort', Dir: 'asc' }] });
  const [name, setName] = useState({ ka: row?.NameKa ?? '', en: row?.NameEn ?? '' });
  const [category, setCategory] = useState(row?.Category ?? 'bank');
  const [isPartner, setIsPartner] = useState(row?.IsPartner ?? true);
  const [pts, setPts] = useState<number[]>(links.map((l) => l.ProductTypeID));
  const [errors, setErrors] = useState<FieldErrors>({});
  // the logo is uploaded / removed at once (not with "save")
  const [logo, setLogo] = useState<string | null>(row?.LogoPath ?? null);
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoError, setLogoError] = useState('');
  const changeLogo = async (file: File | null) => {
    if (!row) return;
    setLogoBusy(true);
    setLogoError('');
    try {
      const r = file
        ? await upload<{ LogoPath: string | null }>(`/admin/organization/uploadLogo/${row.ID}/${row.UID}`, file)
        : await api<{ LogoPath: string | null }>('PUT', `/admin/organization/removeLogo/${row.ID}/${row.UID}`);
      setLogo(r.LogoPath);
      await invalidate('organization');
      toast(file ? 'ლოგო აიტვირთა' : 'ლოგო წაიშალა');
    } catch (e) {
      setLogoError(e instanceof ApiError ? [e.message, ...e.details.map((d) => d.Message)].join(' — ') : 'შეცდომა');
    } finally {
      setLogoBusy(false);
    }
  };

  const save = async () => {
    if (!name.ka.trim()) throw new ApiError(400, 'VALIDATION_ERROR', 'დასახელება სავალდებულოა');
    const body = { NameKa: name.ka, NameEn: name.en || name.ka, Category: category, Color: row?.Color ?? null, IsPartner: isPartner, Sort: row?.Sort ?? 0 };
    const ref = row ? await crud.edit('organization', row, body) : await crud.add('organization', body);
    // accepted product types: add the new ones, remove the unchecked ones
    const want = isPartner ? pts : [];
    for (const id of want.filter((id) => !links.some((l) => l.ProductTypeID === id))) await crud.add('organizationProductType', { OrganizationID: ref.ID, ProductTypeID: id });
    for (const l of links.filter((l) => !want.includes(l.ProductTypeID))) await crud.remove('organizationProductType', l);
    await invalidate('organization', 'organizationProductType');
    toast(row ? 'შენახულია' : 'დაემატა');
  };

  return (
    <Dialog title={row ? 'ორგანიზაციის რედაქტირება' : 'ახალი ორგანიზაცია'} onOk={save} onClose={onClose} onErrors={setErrors}>
      <div className="f">
        <label>დასახელება</label>
        <BiInput value={name} onChange={setName} placeholder="მაგ. ბანკი G" />
        <FieldError errors={errors} field="NameKa" />
      </div>
      <div className="f">
        <label htmlFor="oCat">კატეგორია</label>
        <select id="oCat" value={category} onChange={(e) => setCategory(e.target.value)}>
          {Object.entries(CATEGORIES).map(([k, c]) => (
            <option key={k} value={k}>
              {c.ka} · {c.en}
            </option>
          ))}
        </select>
      </div>
      <div className="f">
        <label>ლოგო</label>
        <div className="logoup">
          <OrgMark org={{ ...row, LogoPath: logo }} cls="lg" />
          {row ? (
            <>
              <label className={`btn${logoBusy ? ' disabled' : ''}`}>
                {logo ? 'შეცვლა' : 'ატვირთვა'}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  hidden
                  disabled={logoBusy}
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    e.target.value = '';
                    if (file) void changeLogo(file);
                  }}
                />
              </label>
              {logo && (
                <button type="button" className="btn" disabled={logoBusy} onClick={() => void changeLogo(null)}>
                  წაშლა
                </button>
              )}
            </>
          ) : null}
        </div>
        {logoError && <small style={{ color: 'var(--red)' }}>{logoError}</small>}
        <small>{row ? 'PNG, JPG, WebP ან SVG, მაქსიმუმ 512 KB; ინახება მაშინვე. ლოგოს გარეშე — loans.ge-ს ლოგო' : 'ლოგოს ატვირთვა — ორგანიზაციის შენახვის შემდეგ'}</small>
      </div>
      <div className="f">
        <label style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Switch checked={isPartner} onChange={setIsPartner} /> პარტნიორია — იღებს განაცხადებს
        </label>
        <small>გამორთულზე ორგანიზაცია მხოლოდ ცნობარისთვისაა (მაგ. ბანკი ვიზარდის მე-4 ნაბიჯში)</small>
      </div>
      {isPartner && (
        <div className="f">
          <label>იღებს პროდუქტის ტიპებს</label>
          <div className="checks">
            {(productTypes.data ?? []).map((p) => (
              <label key={p.ID}>
                <input type="checkbox" checked={pts.includes(p.ID)} onChange={(e) => setPts((v) => (e.target.checked ? [...v, p.ID] : v.filter((x) => x !== p.ID)))} />
                {p.NameKa}
              </label>
            ))}
          </div>
        </div>
      )}
    </Dialog>
  );
}
