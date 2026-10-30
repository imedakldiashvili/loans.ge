import { useQuery } from '@tanstack/react-query';
import { FormEvent, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, ApiError, Base, crud, upload } from '../api/client';
import { useAll, useFind, useInvalidate, useRowActions } from '../api/hooks';
import { useAuth } from '../auth/auth';
import { ArrowsCell, BiInput, BiView, RowActions, Switch } from '../ui/controls';
import { Confirm, FieldError, FieldErrors } from '../ui/dialog';
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
  MinAmount: number | string | null;
  MaxAmount: number | string | null;
}
interface ProductType extends Base {
  NameKa: string;
  NameEn: string;
  MinAmount: number | string;
  MaxAmount: number | string;
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
  // filters: type (category) and partner yes / no
  const [category, setCategory] = useState('');
  const [partner, setPartner] = useState<'' | 'yes' | 'no'>('');
  const [del, setDel] = useState<Org | null>(null);
  const nav = useNavigate();
  useEffect(() => setPage(1), [search, size, category, partner]);

  const filter = { ...(search ? { Search: search } : {}), ...(category ? { Category: category } : {}), ...(partner ? { IsPartner: partner === 'yes' } : {}) };
  const q = useFind<Org>('organization', page, size, { Filter: filter, Sort: [{ Field: 'Sort', Dir: 'asc' }] });
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
      add={writable && <button type="button" className="btn btn-green" onClick={() => nav('/orgs/new')}>+ ორგანიზაცია</button>}
      filters={
        <>
          <input className="search" type="search" placeholder="ძებნა: დასახელება" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select aria-label="ტიპი" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">ყველა ტიპი</option>
            {Object.entries(CATEGORIES).map(([k, c]) => (
              <option key={k} value={k}>
                {c.ka}
              </option>
            ))}
          </select>
          <select aria-label="პარტნიორი" value={partner} onChange={(e) => setPartner(e.target.value as '' | 'yes' | 'no')}>
            <option value="">პარტნიორი და არა</option>
            <option value="yes">პარტნიორი</option>
            <option value="no">არაპარტნიორი</option>
          </select>
        </>
      }
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
                <td className="org-n" style={{ whiteSpace: 'nowrap' }}>
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
                {writable ? <RowActions onEdit={() => nav(`/orgs/${o.ID}/${o.UID}`)} onDelete={() => setDel(o)} /> : <td className="acts" />}
              </tr>
            );
          })
        )}
      </DataTable>
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

/** Add / edit an organisation — its own page (/orgs/new, /orgs/{id}/{uid}), not a dialog. */
export function OrgFormPage() {
  const { id, uid } = useParams();
  const nav = useNavigate();
  const ref = id && uid ? { ID: Number(id), UID: uid } : null;
  const org = useQuery({ queryKey: ['organization', 'detail', id, uid], queryFn: () => crud.detail<Org>('organization', ref!), enabled: !!ref });
  const links = useAll<OrgPt>('organizationProductType');
  const back = () => nav('/orgs');
  const loading = !!ref && (org.isLoading || links.isLoading);
  const { canWrite } = useAuth();
  const ready = !loading && (!ref || !!org.data);
  return (
    <ListPage
      title={ref ? 'ორგანიზაციის რედაქტირება' : 'ახალი ორგანიზაცია'}
      back={{ label: 'ორგანიზაციები', onClick: back }}
      // save in the top-right corner (it submits the form below); leaving without saving = the back link
      add={
        ready &&
        canWrite('organization') && (
          <button type="submit" form="orgf" className="btn btn-green">
            {ref ? 'შენახვა' : 'დამატება'}
          </button>
        )
      }
    >
      {loading ? (
        <div className="orgf-state">იტვირთება…</div>
      ) : ref && !org.data ? (
        <div className="orgf-state">{org.error?.message ?? 'ორგანიზაცია ვერ მოიძებნა'}</div>
      ) : (
        <OrgForm
          key={ref ? `${org.data!.ID}-${org.data!.UpdatedOn ?? ''}` : 'new'}
          row={org.data ?? null}
          links={(links.data ?? []).filter((l) => l.OrganizationID === org.data?.ID)}
          // a new organisation opens its own page, so the logo can be uploaded; an edit goes back to the list
          onSaved={(r, isNew) => (isNew ? nav(`/orgs/${r.ID}/${r.UID}`, { replace: true }) : back())}
        />
      )}
    </ListPage>
  );
}

function OrgForm({ row, links, onSaved }: { row: Org | null; links: OrgPt[]; onSaved: (r: { ID: number; UID: string }, isNew: boolean) => void }) {
  const toast = useToast();
  const invalidate = useInvalidate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const productTypes = useAll<ProductType>('productType', { Sort: [{ Field: 'Sort', Dir: 'asc' }] });
  const [name, setName] = useState({ ka: row?.NameKa ?? '', en: row?.NameEn ?? '' });
  const [category, setCategory] = useState(row?.Category ?? 'bank');
  const [isPartner, setIsPartner] = useState(row?.IsPartner ?? true);
  const [pts, setPts] = useState<number[]>(links.map((l) => l.ProductTypeID));
  // the amounts it lends per product (empty = no limit); a newly checked product starts with the product's own limits
  const str = (v: number | string | null | undefined) => (v === null || v === undefined ? '' : String(Number(v)));
  const [amounts, setAmounts] = useState<Record<number, { min: string; max: string }>>(Object.fromEntries(links.map((l) => [l.ProductTypeID, { min: str(l.MinAmount), max: str(l.MaxAmount) }])));
  const num = (v: string | undefined) => (v && v.trim() ? Number(v) : null);
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
      setLogoError(e instanceof ApiError ? [e.message, ...e.details.map((d) => d.Message)].join(' - ') : 'შეცდომა');
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
    const linkBody = (id: number) => ({ OrganizationID: ref.ID, ProductTypeID: id, MinAmount: num(amounts[id]?.min), MaxAmount: num(amounts[id]?.max) });
    for (const id of want.filter((id) => !links.some((l) => l.ProductTypeID === id))) await crud.add('organizationProductType', linkBody(id));
    // kept ones whose amounts changed
    for (const l of links.filter((l) => want.includes(l.ProductTypeID))) {
      const b = linkBody(l.ProductTypeID);
      if (b.MinAmount !== num(str(l.MinAmount)) || b.MaxAmount !== num(str(l.MaxAmount))) await crud.edit('organizationProductType', l, b);
    }
    for (const l of links.filter((l) => !want.includes(l.ProductTypeID))) await crud.remove('organizationProductType', l);
    await invalidate('organization', 'organizationProductType');
    toast(row ? 'შენახულია' : 'დაემატა');
    return ref;
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    setErrors({});
    try {
      const ref = await save();
      onSaved(ref, !row);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setErrors(Object.fromEntries(err.details.map((d) => [d.Field, d.Message])));
      } else if (err instanceof Error && err.message) setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form id="orgf" className="orgf" onSubmit={submit}>
      {error && <div className="lerr">{error}</div>}
      <div className="f">
        <label>დასახელება</label>
        <BiInput value={name} onChange={setName} placeholder="მაგ. საქართველოს ბანკი" />
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
        <small>{row ? 'PNG, JPG, WebP ან SVG, მაქსიმუმ 512 KB; ინახება მაშინვე. ლოგოს გარეშე - loans.ge-ს ლოგო' : 'ლოგოს ატვირთვა - ორგანიზაციის შენახვის შემდეგ'}</small>
      </div>
      <div className="f">
        <label style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Switch checked={isPartner} onChange={setIsPartner} /> პარტნიორია - იღებს განაცხადებს
        </label>
        <small>გამორთულზე ორგანიზაცია მხოლოდ ცნობარისთვისაა (მაგ. ბანკი ვიზარდის მე-4 ნაბიჯში)</small>
      </div>
      {isPartner && (
        <div className="f">
          <label>იღებს პროდუქტის ტიპებს - თანხა მინ. / მაქს. (₾)</label>
          <div className="pt-amounts">
            {(productTypes.data ?? []).map((p) => {
              const on = pts.includes(p.ID);
              const a = amounts[p.ID] ?? { min: '', max: '' };
              const set = (k: 'min' | 'max', v: string) => setAmounts((m) => ({ ...m, [p.ID]: { ...a, [k]: v } }));
              return (
                <div key={p.ID} className="pt-amount">
                  <label>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={(e) => {
                        setPts((v) => (e.target.checked ? [...v, p.ID] : v.filter((x) => x !== p.ID)));
                        if (e.target.checked && !amounts[p.ID]) setAmounts((m) => ({ ...m, [p.ID]: { min: str(p.MinAmount), max: str(p.MaxAmount) } }));
                      }}
                    />
                    {p.NameKa}
                  </label>
                  {on && (
                    <>
                      <input type="number" min={0} step={100} inputMode="numeric" placeholder="მინ." aria-label={`${p.NameKa} - მინიმუმი`} value={a.min} onChange={(e) => set('min', e.target.value)} />
                      <input type="number" min={0} step={100} inputMode="numeric" placeholder="მაქს." aria-label={`${p.NameKa} - მაქსიმუმი`} value={a.max} onChange={(e) => set('max', e.target.value)} />
                    </>
                  )}
                </div>
              );
            })}
          </div>
          <FieldError errors={errors} field="MaxAmount" />
          <small>ვიზარდში ორგანიზაცია მხოლოდ ამ თანხებზე გამოჩნდება; ცარიელი - შეზღუდვის გარეშე</small>
        </div>
      )}
    </form>
  );
}
