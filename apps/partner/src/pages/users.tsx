import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError, crud, findAll } from '../api';
import { ROLES, useRefs, useSession } from '../session';
import { Chevron, EditIcon, ErrorLine, Modal, Switch, usePaged, useToast } from '../ui/ui';
import { useProducts } from './products';

// Organisation staff (prototype partner.html renderUsers / userForm) — /partner/staff.
// A row: name + role · e-mail, mobile · the number of products and cities (no limit — all); the names open below it.

interface Staff {
  ID: number;
  UID: string;
  IsEnable: boolean;
  Role: 'sales' | 'back';
  DisplayName: string;
  ScopeProducts: number[];
  ScopeCities: number[];
  User: { ID: number; Email: string | null; Phone: string | null };
}

const errText = (e: unknown) => (e instanceof ApiError ? [e.message, ...e.details.map((x) => x.Message)].join(' - ') : 'შეცდომა');

export function UsersPage() {
  const { me } = useSession();
  const { cities } = useRefs();
  const products = useProducts();
  const qc = useQueryClient();
  const [open, setOpen] = useState<number | null>(null);
  const toast = useToast();
  const q = useQuery({ queryKey: ['staff'], queryFn: () => findAll<Staff>('partner', 'staff') });
  const [form, setForm] = useState<Staff | 'new' | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ['staff'] });
  // filters: role, product, location — no limit (and back office) covers every product / city
  const [fRole, setFRole] = useState('');
  const [fProd, setFProd] = useState('');
  const [fCity, setFCity] = useState('');
  const covers = (u: Staff, ids: number[], id: string) => !id || u.Role !== 'sales' || !ids.length || ids.includes(Number(id));
  const list = (q.data ?? []).filter((u) => (!fRole || u.Role === fRole) && covers(u, u.ScopeProducts, fProd) && covers(u, u.ScopeCities, fCity));
  const { shown, pager } = usePaged(list, [fRole, fProd, fCity]);
  const self = (u: Staff) => u.ID === me?.Profile?.ID;
  const org = me?.Profile?.Organization;
  const logo = org?.LogoPath ? `/fs/${org.LogoPath}` : '/fs/default/org-logo.png';
  // the scope in full (the row's expanded part): names; no limit (and back office) — all
  const limited = (u: Staff, ids: number[]) => u.Role === 'sales' && ids.length > 0;
  const prodNames = (u: Staff) => (limited(u, u.ScopeProducts) ? u.ScopeProducts.map((id) => products.data?.find((p) => p.ID === id)?.ProductType.NameKa).filter(Boolean).join(', ') : 'ყველა');
  const cityNames = (u: Staff) => (limited(u, u.ScopeCities) ? u.ScopeCities.map((id) => cities.find((c) => c.ID === id)?.NameKa).filter(Boolean).join(', ') : 'ყველა');

  return (
    <div className="main">
      <div className="top">
        <h2>მომხმარებლები</h2>
        <button type="button" className="btn btn-green topbtn" onClick={() => setForm('new')}>
          + მომხმარებელი
        </button>
      </div>
      <div className="srow">
        <select className="fsel" aria-label="როლი" value={fRole} onChange={(e) => setFRole(e.target.value)}>
          <option value="">აირჩიე როლი</option>
          <option value="sales">{ROLES.sales}</option>
          <option value="back">{ROLES.back}</option>
        </select>
        <select className="fsel" aria-label="პროდუქტი" value={fProd} onChange={(e) => setFProd(e.target.value)}>
          <option value="">აირჩიე პროდუქტი</option>
          {(products.data ?? []).map((x) => (
            <option key={x.ID} value={x.ID}>
              {x.ProductType.NameKa}
            </option>
          ))}
        </select>
        <select className="fsel" aria-label="ლოკაცია" value={fCity} onChange={(e) => setFCity(e.target.value)}>
          <option value="">აირჩიე ლოკაცია</option>
          {cities.map((c) => (
            <option key={c.ID} value={c.ID}>
              {c.NameKa}
            </option>
          ))}
        </select>
      </div>
      <div className="list">
        {!list.length && <div className="empty">{q.isLoading ? 'იტვირთება…' : q.data?.length ? 'ფილტრით მომხმარებელი არ მოიძებნა' : 'მომხმარებელი არ არის'}</div>}
        {shown.map((u) => (
          <div key={u.ID} className={`card${open === u.ID ? ' open' : ''}`}>
            <div className="prow urow">
              {/* the organisation's logo (staff are all of this organisation) */}
              <span className="lg img" style={{ width: 40, height: 40, borderRadius: 8 }}>
                <img src={logo} alt="" />
              </span>
              {/* the name, and under it the role */}
              <span className="pinfo">
                <b>
                  {u.DisplayName}
                  {self(u) && <small> (შენ)</small>}
                </b>
                <span>
                  <span className={`st role ${u.Role}`}>{ROLES[u.Role]}</span>
                </span>
              </span>
              {/* the contacts: e-mail, mobile — one per line */}
              <span className="pinfo ucont">
                <small>{u.User.Email || '-'}</small>
                <small>{u.User.Phone || '-'}</small>
              </span>
              {/* the scope: the number of products and the cities; no limit (and back office) — all */}
              <span className="pmeta">
                <small>პროდუქტები: {limited(u, u.ScopeProducts) ? u.ScopeProducts.length : 'ყველა'}</small>
                <small>ლოკაცია: {limited(u, u.ScopeCities) ? u.ScopeCities.length : 'ყველა'}</small>
              </span>
              <span className="racts p">
                <Switch
                  on={u.IsEnable}
                  disabled={self(u)}
                  onChange={async (v) => {
                    try {
                      await crud('partner', 'staff').enable(u, v);
                      toast(v ? 'მომხმარებელი ჩაირთო' : 'მომხმარებელი გამოირთო');
                      refresh();
                    } catch (e) {
                      toast(errText(e));
                    }
                  }}
                />
                <button type="button" className="ib edit" title="რედაქტირება" aria-label="რედაქტირება" onClick={() => setForm(u)}>
                  <EditIcon />
                </button>
              </span>
              <button type="button" className="ib tg" aria-label="ჩამოშლა" aria-expanded={open === u.ID} onClick={() => setOpen(open === u.ID ? null : u.ID)}>
                <Chevron />
              </button>
            </div>
            {open === u.ID && (
              <div className="det cards">
                <span className="pinfo">
                  <small>
                    <b>პროდუქტები:</b> {prodNames(u)}
                  </small>
                  <small>
                    <b>ლოკაცია:</b> {cityNames(u)}
                  </small>
                </span>
              </div>
            )}
          </div>
        ))}
      </div>
      {pager}
      {form && <UserForm u={form === 'new' ? null : form} self={form !== 'new' && self(form)} onClose={() => setForm(null)} onSaved={() => (setForm(null), refresh())} />}
    </div>
  );
}

function UserForm({ u, self, onClose, onSaved }: { u: Staff | null; self: boolean; onClose: () => void; onSaved: () => void }) {
  const { cities } = useRefs();
  const products = useProducts();
  const toast = useToast();
  const [name, setName] = useState(u?.DisplayName ?? '');
  const [role, setRole] = useState<'sales' | 'back'>(u?.Role ?? 'sales');
  const [phone, setPhone] = useState(u?.User.Phone ?? '');
  const [email, setEmail] = useState(u?.User.Email ?? '');
  const [prods, setProds] = useState<number[]>(u?.ScopeProducts ?? []);
  const [cits, setCits] = useState<number[]>(u?.ScopeCities ?? []);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const toggle = (list: number[], set: (x: number[]) => void, id: number) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const save = async () => {
    if (!name.trim()) return setError('სახელი სავალდებულოა');
    setBusy(true);
    setError('');
    try {
      const body = { DisplayName: name.trim(), Role: role, Phone: phone.trim() || null, Email: email.trim() || null, ScopeProducts: role === 'sales' ? prods : [], ScopeCities: role === 'sales' ? cits : [] };
      const api = crud('partner', 'staff');
      // on / off is on the list row, not in the form (a new one starts on)
      if (u) await api.edit(u, body);
      else await api.add(body);
      toast(u ? 'მომხმარებელი შეინახა' : 'მომხმარებელი დაემატა');
      onSaved();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={u ? 'მომხმარებლის რედაქტირება' : 'ახალი მომხმარებელი'} onClose={onClose}>
      <div className="form f main-form">
        <div className="fld">
          <label htmlFor="uName">სახელი გვარი</label>
          <input id="uName" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div className="fld">
          <label htmlFor="uRole">როლი</label>
          <select id="uRole" value={role} disabled={self} onChange={(e) => setRole(e.target.value as 'sales' | 'back')}>
            <option value="sales">{ROLES.sales}</option>
            <option value="back">{ROLES.back}</option>
          </select>
        </div>
        <div className="grid2">
          <div className="fld">
            <label htmlFor="uPhone">მობილური</label>
            <input id="uPhone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="fld">
            <label htmlFor="uEmail">ელ. ფოსტა</label>
            <input id="uEmail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
        </div>
        {role === 'sales' && (
          <>
            <div className="fld">
              <label>
                პროდუქტები <small style={{ color: 'var(--muted)', fontWeight: 400 }}>(არცერთი = ყველა)</small>
              </label>
              <div className="tpl rs">
                {(products.data ?? []).map((p) => (
                  <label key={p.ID} className={prods.includes(p.ID) ? 'on' : ''}>
                    <input type="checkbox" checked={prods.includes(p.ID)} onChange={() => toggle(prods, setProds, p.ID)} />
                    <i />
                    <b>
                      {p.ProductType.NameKa}
                      {!p.IsEnable && <small> (გამორთული)</small>}
                    </b>
                  </label>
                ))}
              </div>
            </div>
            <div className="fld">
              <label>
                ლოკაცია <small style={{ color: 'var(--muted)', fontWeight: 400 }}>(არცერთი = ყველა)</small>
              </label>
              <div className="tpl rs cols">
                {cities.map((c) => (
                  <label key={c.ID} className={cits.includes(c.ID) ? 'on' : ''}>
                    <input type="checkbox" checked={cits.includes(c.ID)} onChange={() => toggle(cits, setCits, c.ID)} />
                    <i />
                    <b>{c.NameKa}</b>
                  </label>
                ))}
              </div>
            </div>
          </>
        )}
        <ErrorLine error={error} />
        <div className="fbtns">
          <button type="button" className="btn btn-green" disabled={busy} onClick={save}>
            შენახვა
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            დახურვა
          </button>
        </div>
      </div>
    </Modal>
  );
}
