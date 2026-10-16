import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ApiError, Base, crud } from '../api/client';
import { useAll, useFind, useInvalidate, useRowActions } from '../api/hooks';
import { ADMIN_ROLES, useAuth } from '../auth/auth';
import { RowActions, Switch } from '../ui/controls';
import { Confirm, Dialog, FieldError, FieldErrors } from '../ui/dialog';
import { DataTable, ListPage, Pager, StateRow, usePageSize } from '../ui/list-page';
import { useToast } from '../ui/toast';
import { OrgLite, OrgMark, ROLES } from './common';

// Users: borrowers, organisation staff, admins (prototype renderUsers / staffDialog / adminDialog).

interface UserLite {
  ID: number;
  UID: string;
  Email: string | null;
  Phone: string | null;
  UserName: string | null;
  IsEnable: boolean;
  IsVerified: boolean;
  LastLoginOn: string | null;
}
interface Profile extends Base {
  UserID: number;
  Role: string | null;
  DisplayName: string | null;
  OrganizationID: number | null;
  ScopeCities: number[];
  ScopeProducts: number[];
  User: UserLite;
  Organization?: OrgLite;
  Customer?: { Pid: string | null; FirstName: string | null; LastName: string | null; CityID: number | null };
}
interface Named extends Base {
  NameKa: string;
  NameEn: string;
}

const TABS = {
  customers: { title: 'მომხმარებლები', module: 'customer', desc: 'მომხმარებლის საიტის ანგარიშები (მსესხებლები). პირველ შესვლაზე იქმნება ავტომატურად. გამორთული მომხმარებელი ვერ შედის.' },
  staff: { title: 'თანამშრომლები', module: 'staff', desc: 'პარტნიორის კაბინეტის ანგარიშები. გაყიდვების მენეჯერს შეზღუდვები აქვს ლოკაციაზე (და პროდუქტებზე); ცარიელი = ყველა. ერთი ადამიანი შეიძლება რამდენიმე ორგანიზაციაში იყოს.' },
  admins: { title: 'ადმინისტრატორები', module: 'admin', desc: 'ამ კონსოლის ანგარიშები. შესვლა — ელ.ფოსტა ან მობილური + ერთჯერადი კოდი.' },
} as const;
type Tab = keyof typeof TABS;

export function UsersPage() {
  const { key = 'customers' } = useParams();
  const tab = (key in TABS ? key : 'customers') as Tab;
  return <UsersList key={tab} tab={tab} />;
}

function UsersList({ tab }: { tab: Tab }) {
  const { canWrite, me } = useAuth();
  const toast = useToast();
  const cfg = TABS[tab];
  const [size, setSize] = usePageSize();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [org, setOrg] = useState<number | ''>('');
  const [role, setRole] = useState('');
  const [dialog, setDialog] = useState<{ row: Profile | null } | null>(null);
  const [del, setDel] = useState<Profile | null>(null);
  useEffect(() => setPage(1), [search, org, role, size]);

  const orgs = useAll<OrgLite & Base & { IsPartner: boolean }>('organization', { Sort: [{ Field: 'Sort', Dir: 'asc' }] });
  const cities = useAll<Named>('city');
  const filter = { ...(search ? { Search: search } : {}), ...(tab === 'staff' && org !== '' ? { OrganizationID: org } : {}), ...(tab === 'staff' && role ? { Role: role } : {}) };
  const q = useFind<Profile>(cfg.module, page, size, { Filter: filter, Sort: [{ Field: 'ID', Dir: 'asc' }] });
  const act = useRowActions(cfg.module, ['user']);
  const writable = canWrite(cfg.module);
  const rows = q.data?.Items ?? [];
  const cityNames = (ids: number[]) => ids.map((id) => cities.data?.find((c) => c.ID === id)?.NameKa ?? id).join(', ');
  const self = (p: Profile) => p.ID === me?.Profile?.ID;
  const toggle = (p: Profile, on: boolean) =>
    act.enable.mutate({ r: p, on }, { onSuccess: () => toast(on ? 'გააქტიურდა' : 'დეაქტივირებულია'), onError: (e) => toast(e.message) });

  const span = tab === 'customers' ? 7 : 6;
  return (
    <ListPage
      title={cfg.title}
      desc={cfg.desc}
      add={
        writable && tab !== 'customers' && (
          <button type="button" className="btn btn-green" onClick={() => setDialog({ row: null })}>
            {tab === 'staff' ? '+ თანამშრომელი' : '+ ადმინისტრატორი'}
          </button>
        )
      }
      filters={
        <>
          <input className="search" type="search" placeholder="ძებნა: სახელი, ელ.ფოსტა, მობილური" value={search} onChange={(e) => setSearch(e.target.value)} />
          {tab === 'staff' && (
            <>
              <select aria-label="როლი" value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="">ყველა როლი</option>
                {Object.entries(ROLES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <select aria-label="ორგანიზაცია" value={org} onChange={(e) => setOrg(e.target.value ? Number(e.target.value) : '')}>
                <option value="">ყველა ორგანიზაცია</option>
                {(orgs.data ?? []).filter((o) => o.IsPartner).map((o) => (
                  <option key={o.ID} value={o.ID}>
                    {o.NameKa}
                  </option>
                ))}
              </select>
            </>
          )}
        </>
      }
      foot={<Pager page={page} totalPages={q.data?.TotalPages ?? 1} size={size} onPage={setPage} onSize={setSize} />}
    >
      <DataTable
        head={
          tab === 'customers' ? (
            <tr>
              <th>მომხმარებელი</th>
              <th>ელ.ფოსტა</th>
              <th className="w4">მობილური</th>
              <th className="w4">პირადი №</th>
              <th className="w5">ვერიფიკაცია</th>
              <th className="w5">ბოლო შესვლა</th>
              <th className="w2">აქტიური</th>
            </tr>
          ) : tab === 'staff' ? (
            <tr>
              <th>თანამშრომელი</th>
              <th className="w5">ორგანიზაცია</th>
              <th>კონტაქტი</th>
              <th>შეზღუდვები</th>
              <th className="w2">აქტიური</th>
              <th className="acts" />
            </tr>
          ) : (
            <tr>
              <th>ადმინისტრატორი</th>
              <th className="w5">როლი</th>
              <th>ელ.ფოსტა</th>
              <th className="w5">მობილური</th>
              <th className="w2">აქტიური</th>
              <th className="acts" />
            </tr>
          )
        }
      >
        {rows.length === 0 ? (
          <StateRow span={span} loading={q.isLoading} error={q.error?.message} empty="ჩანაწერი არ მოიძებნა" />
        ) : (
          rows.map((p) => (
            <tr key={p.ID} className={p.IsEnable && p.User.IsEnable ? '' : 'inactive'}>
              {tab === 'customers' ? (
                <>
                  <td>{[p.Customer?.FirstName, p.Customer?.LastName].filter(Boolean).join(' ') || p.DisplayName || p.User.UserName || '—'}</td>
                  <td>{p.User.Email ?? '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{p.User.Phone ?? '—'}</td>
                  <td>{p.Customer?.Pid ?? '—'}</td>
                  <td>{p.User.IsVerified ? <span className="tag green">ვერიფიცირებული</span> : <span className="tag grey">არა</span>}</td>
                  <td>{p.User.LastLoginOn ? new Date(p.User.LastLoginOn).toLocaleString('ka-GE') : '—'}</td>
                  <td>
                    <Switch checked={p.IsEnable} disabled={!writable} onChange={(on) => toggle(p, on)} />
                  </td>
                </>
              ) : tab === 'staff' ? (
                <>
                  <td>
                    {p.DisplayName}
                    <span className="sub">{ROLES[p.Role ?? ''] ?? p.Role}</span>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <OrgMark org={p.Organization} />
                    {p.Organization?.NameKa}
                  </td>
                  <td>
                    {p.User.Email}
                    <span className="sub">{p.User.Phone ?? ''}</span>
                  </td>
                  <td>
                    {p.Role === 'back' ? (
                      <span className="sub">სრული წვდომა</span>
                    ) : (
                      <>
                        <span className="sub">პროდუქტები: {p.ScopeProducts.length ? p.ScopeProducts.length : 'ყველა'}</span>
                        <span className="sub">ლოკაცია: {p.ScopeCities.length ? cityNames(p.ScopeCities) : 'ყველა'}</span>
                      </>
                    )}
                  </td>
                  <td>
                    <Switch checked={p.IsEnable} disabled={!writable} onChange={(on) => toggle(p, on)} />
                  </td>
                  {writable ? <RowActions onEdit={() => setDialog({ row: p })} onDelete={() => setDel(p)} /> : <td className="acts" />}
                </>
              ) : (
                <>
                  <td>
                    {p.DisplayName}
                    {self(p) && <small style={{ color: 'var(--muted)' }}> (შენ)</small>}
                  </td>
                  <td>
                    <span className={`tag ${p.Role === 'super' ? '' : p.Role === 'operator' ? 'blue' : 'teal'}`}>{ADMIN_ROLES[p.Role as keyof typeof ADMIN_ROLES]}</span>
                  </td>
                  <td>{p.User.Email}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{p.User.Phone}</td>
                  <td>
                    <Switch checked={p.IsEnable} disabled={!writable || self(p)} onChange={(on) => toggle(p, on)} />
                  </td>
                  {writable ? <RowActions onEdit={() => setDialog({ row: p })} onDelete={self(p) ? undefined : () => setDel(p)} /> : <td className="acts" />}
                </>
              )}
            </tr>
          ))
        )}
      </DataTable>
      {dialog && tab !== 'customers' && <ProfileDialog tab={tab} row={dialog.row} orgs={(orgs.data ?? []).filter((o) => o.IsPartner)} cities={cities.data ?? []} defaultOrg={org} onClose={() => setDialog(null)} />}
      {del && (
        <Confirm
          title={`წავშალოთ ${del.DisplayName}?`}
          text={tab === 'staff' ? `${del.Organization?.NameKa} — თანამშრომელი პარტნიორის კაბინეტში ვეღარ შევა.` : 'ანგარიშით კონსოლში ვეღარ შევა.'}
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

function ProfileDialog({ tab, row, orgs, cities, defaultOrg, onClose }: { tab: 'staff' | 'admins'; row: Profile | null; orgs: OrgLite[]; cities: Named[]; defaultOrg: number | ''; onClose: () => void }) {
  const toast = useToast();
  const invalidate = useInvalidate();
  const [name, setName] = useState(row?.DisplayName ?? '');
  const [email, setEmail] = useState(row?.User.Email ?? '');
  const [phone, setPhone] = useState(row?.User.Phone ?? '');
  const [role, setRole] = useState(row?.Role ?? (tab === 'staff' ? 'sales' : 'operator'));
  const [orgId, setOrgId] = useState<number | ''>(row?.OrganizationID ?? defaultOrg ?? '');
  const [scopeCities, setScopeCities] = useState<number[]>(row?.ScopeCities ?? []);
  const [errors, setErrors] = useState<FieldErrors>({});
  const module = tab === 'staff' ? 'staff' : 'admin';

  const save = async () => {
    if (!name.trim()) throw new ApiError(400, 'VALIDATION_ERROR', 'სახელი სავალდებულოა');
    const body = {
      DisplayName: name.trim(), Email: email.trim() || null, Phone: phone.trim() || null, Role: role,
      ...(tab === 'staff' ? { OrganizationID: orgId, ScopeCities: role === 'sales' ? scopeCities : [], ScopeProducts: row?.ScopeProducts ?? [] } : {}),
    };
    if (row) await crud.edit(module, row, body);
    else await crud.add(module, body);
    await invalidate(module, 'user');
    toast('შენახულია');
  };

  return (
    <Dialog title={row ? (tab === 'staff' ? 'თანამშრომლის რედაქტირება' : 'ადმინისტრატორის რედაქტირება') : tab === 'staff' ? 'ახალი თანამშრომელი' : 'ახალი ადმინისტრატორი'} onOk={save} onClose={onClose} onErrors={setErrors}>
      {tab === 'staff' && (
        <div className="fgrid" style={{ padding: 0 }}>
          <div className="f">
            <label htmlFor="sOrg">ორგანიზაცია</label>
            <select id="sOrg" value={orgId} disabled={!!row} required onChange={(e) => setOrgId(Number(e.target.value))}>
              <option value="" />
              {orgs.map((o) => (
                <option key={o.ID} value={o.ID}>
                  {o.NameKa}
                </option>
              ))}
            </select>
            <FieldError errors={errors} field="OrganizationID" />
          </div>
          <div className="f">
            <label htmlFor="sRole">როლი</label>
            <select id="sRole" value={role} onChange={(e) => setRole(e.target.value)}>
              {Object.entries(ROLES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
      <div className="f">
        <label htmlFor="sName">სახელი, გვარი</label>
        <input id="sName" value={name} required onChange={(e) => setName(e.target.value)} />
        <FieldError errors={errors} field="DisplayName" />
      </div>
      {tab === 'admins' && (
        <div className="f">
          <label htmlFor="aRole">როლი</label>
          <select id="aRole" value={role} onChange={(e) => setRole(e.target.value)}>
            {Object.entries(ADMIN_ROLES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="fgrid" style={{ padding: 0 }}>
        <div className="f">
          <label htmlFor="sEmail">ელ.ფოსტა</label>
          <input id="sEmail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <FieldError errors={errors} field="Email" />
        </div>
        <div className="f">
          <label htmlFor="sPhone">მობილური</label>
          <input id="sPhone" type="tel" value={phone} placeholder="5.. .. .. .." onChange={(e) => setPhone(e.target.value)} />
          <FieldError errors={errors} field="Phone" />
        </div>
      </div>
      {tab === 'staff' && role === 'sales' && (
        <div className="f">
          <label>
            ლოკაცია <small style={{ display: 'inline' }}>(არცერთი = ყველა)</small>
          </label>
          <div className="checks">
            {cities.map((c) => (
              <label key={c.ID}>
                <input type="checkbox" checked={scopeCities.includes(c.ID)} onChange={(e) => setScopeCities((v) => (e.target.checked ? [...v, c.ID] : v.filter((x) => x !== c.ID)))} />
                {c.NameKa}
              </label>
            ))}
          </div>
          <small>პროდუქტების შეზღუდვა დაემატება პარტნიორის პროდუქტებთან ერთად</small>
        </div>
      )}
    </Dialog>
  );
}
