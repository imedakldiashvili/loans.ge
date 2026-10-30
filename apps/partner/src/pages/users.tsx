import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError, crud, findAll } from '../api';
import { ROLES, useRefs, useSession } from '../session';
import { EditIcon, ErrorLine, Modal, Switch, usePaged, useToast } from '../ui/ui';
import { useProducts } from './products';

// Organisation staff (prototype partner.html renderUsers / userForm) — /partner/staff.

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
  const toast = useToast();
  const q = useQuery({ queryKey: ['staff'], queryFn: () => findAll<Staff>('partner', 'staff') });
  const [form, setForm] = useState<Staff | 'new' | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ['staff'] });
  const list = q.data ?? [];
  const { shown, pager } = usePaged(list);
  const self = (u: Staff) => u.ID === me?.Profile?.ID;
  const pName = (id: number) => products.data?.find((p) => p.ID === id)?.ProductType.NameKa;

  return (
    <div className="main">
      <div className="top">
        <h2>მომხმარებლები</h2>
        <button type="button" className="btn btn-green topbtn" onClick={() => setForm('new')}>
          + მომხმარებელი
        </button>
      </div>
      <div className="list">
        {!list.length && <div className="empty">{q.isLoading ? 'იტვირთება…' : 'მომხმარებელი არ არის'}</div>}
        {shown.map((u) => (
          <div key={u.ID} className="card">
            <div className="prow">
              <span className="lg" style={{ background: 'var(--blue)', width: 40, height: 40, borderRadius: '50%', color: '#fff', fontWeight: 700, display: 'grid', placeItems: 'center' }}>
                {u.DisplayName.slice(0, 1)}
              </span>
              <span className="pinfo">
                <b>
                  {u.DisplayName}
                  {self(u) && <small> (შენ)</small>}
                </b>
                <small>{[u.User.Phone, u.User.Email].filter(Boolean).join(' · ')}</small>
                <span>
                  <span className={`st role ${u.Role}`}>{ROLES[u.Role]}</span>
                </span>
              </span>
              <span className="pmeta">
                {u.Role === 'sales' ? (
                  <>
                    <small>პროდუქტები: {u.ScopeProducts.length ? u.ScopeProducts.map(pName).filter(Boolean).join(', ') : 'ყველა'}</small>
                    <small>ლოკაცია: {u.ScopeCities.length ? u.ScopeCities.map((id) => cities.find((c) => c.ID === id)?.NameKa).filter(Boolean).join(', ') : 'ყველა'}</small>
                  </>
                ) : (
                  <small>სრული წვდომა</small>
                )}
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
            </div>
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
  const [active, setActive] = useState(u?.IsEnable ?? true);
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
      if (u) {
        await api.edit(u, body);
        if (active !== u.IsEnable) await api.enable(u, active);
      } else {
        const r = await api.add(body);
        if (!active) await api.enable(r, false);
      }
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
        <div className="fld">
          <label className="chk">
            <Switch on={active} onChange={setActive} disabled={self} /> აქტიური
          </label>
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
