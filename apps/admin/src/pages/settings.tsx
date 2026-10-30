import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { ApiError, Base } from '../api/client';
import { useAll, useFind, useRowActions } from '../api/hooks';
import { useAuth } from '../auth/auth';
import { BiInput, BiView, RowActions, Switch } from '../ui/controls';
import { Confirm, Dialog, FieldError, FieldErrors } from '../ui/dialog';
import { Icon } from '../ui/icons';
import { DataTable, ListPage, StateRow } from '../ui/list-page';
import { useToast } from '../ui/toast';
import { STATUS_CATEGORIES, statusColor, StatusRow } from './common';

// Settings: statuses, transitions, OTP channels (prototype renderSettings / statusDialog / renderOtp / otpDialog).

export function SettingsPage() {
  const { key = 'statuses' } = useParams();
  if (key === 'transitions') return <TransitionsPage />;
  if (key === 'otp') return <OtpPage />;
  if (key === 'notify') return <NotifyPage />;
  if (key === 'pin') return <PinPage />;
  return <StatusesPage />;
}

const CAT_TAG: Record<string, string> = { progress: 'blue', complete: 'green', canceled: 'grey' };
const catLabel = (c: string) => {
  const x = STATUS_CATEGORIES.find((y) => y.key === c) ?? STATUS_CATEGORIES[0];
  return `${x.en} · ${x.ka}`;
};

// ── statuses
function StatusesPage() {
  const { canWrite } = useAuth();
  const toast = useToast();
  const q = useFind<StatusRow>('status', 1, 100, { Sort: [{ Field: 'Sort', Dir: 'asc' }] });
  const act = useRowActions('status');
  const writable = canWrite('status');
  const [dialog, setDialog] = useState<{ row: StatusRow | null } | null>(null);
  const [del, setDel] = useState<StatusRow | null>(null);
  const rows = q.data?.Items ?? [];
  const flags = (s: StatusRow) =>
    [s.HidesPersonalData && 'მონაცემები დამალულია', s.RequiresOffer && 'სჭირდება შეთავაზება', s.RequiresIssued && 'სჭირდება გაცემა', s.IsExpiryTarget && 'ვადის გასვლის სტატუსი', s.RevealsContacts && 'კონტაქტები იხსნება'].filter(Boolean) as string[];

  return (
    <ListPage
      title="პარამეტრები · სტატუსები"
      desc="სტატუსების ტექსტები სამივე ზედაპირისთვის, კატეგორია (In Progress / Complete / Canceled - მონიტორინგი ამით ჯგუფდება), ტაიმერი სტატუსის დაწყებიდან და ქცევის მონიშვნები. სტატუსები და გადასვლები ბაზაშია - ახლის დამატება კოდის შეცვლის გარეშე."
      add={writable && <button type="button" className="btn btn-green" onClick={() => setDialog({ row: null })}>+ სტატუსი</button>}
    >
      <DataTable
        head={
          <tr>
            <th className="w5">სტატუსი</th>
            <th>მომხმარებლის საიტი</th>
            <th>პარტნიორის კაბინეტი</th>
            <th className="w5">მოკლე (ჩიპი)</th>
            <th className="w6">კატეგორია</th>
            <th className="num w3">ტაიმერი</th>
            <th>ქცევა</th>
            <th className="w2">აქტიური</th>
            <th className="w2 num">რიგი</th>
            <th className="acts" />
          </tr>
        }
      >
        {rows.length === 0 ? (
          <StateRow span={10} loading={q.isLoading} error={q.error?.message} />
        ) : (
          rows.map((s, i) => (
            <tr key={s.ID} className={s.IsEnable ? '' : 'inactive'}>
              <td style={{ whiteSpace: 'nowrap' }}>
                <span className="dot" style={{ background: statusColor(s) }} />
                <code>{s.Key}</code>
              </td>
              <td>
                <BiView ka={s.CustomerKa} en={s.CustomerEn} />
              </td>
              <td>{s.PartnerLabel}</td>
              <td>{s.ChipLabel}</td>
              <td>
                <span className={`tag ${CAT_TAG[s.Category]}`}>{catLabel(s.Category)}</span>
              </td>
              <td className="num">{s.TtlMinutes ? `${s.TtlMinutes} წთ` : '-'}</td>
              <td>
                <div className="chips">
                  {flags(s).map((f) => (
                    <span key={f} className="chip">
                      {f}
                    </span>
                  ))}
                </div>
              </td>
              <td>
                <Switch checked={s.IsEnable} disabled={!writable} onChange={(on) => act.enable.mutate({ r: s, on })} />
              </td>
              <td className="num" style={{ whiteSpace: 'nowrap' }}>
                <button type="button" className="ib" title="ზემოთ" disabled={!writable || i === 0} onClick={() => act.move.mutate({ r: s, dir: 'up' })}>
                  <Icon.up />
                </button>{' '}
                <button type="button" className="ib" title="ქვემოთ" disabled={!writable || i === rows.length - 1} onClick={() => act.move.mutate({ r: s, dir: 'down' })}>
                  <Icon.down />
                </button>
              </td>
              {writable ? <RowActions onEdit={() => setDialog({ row: s })} onDelete={() => setDel(s)} /> : <td className="acts" />}
            </tr>
          ))
        )}
      </DataTable>
      {dialog && (
        <StatusDialog
          row={dialog.row}
          onSave={async (b) => {
            await act.save(dialog.row, b);
            toast('შენახულია');
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {del && (
        <Confirm
          title={`წავშალოთ სტატუსი „${del.Key}"?`}
          text="გამოყენებულ სტატუსს ვერ წაშლი - გამორთე."
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

function StatusDialog({ row, onSave, onClose }: { row: StatusRow | null; onSave: (b: object) => Promise<void>; onClose: () => void }) {
  const [key, setKey] = useState(row?.Key ?? '');
  const [customer, setCustomer] = useState({ ka: row?.CustomerKa ?? '', en: row?.CustomerEn ?? '' });
  const [partner, setPartner] = useState(row?.PartnerLabel ?? '');
  const [chip, setChip] = useState(row?.ChipLabel ?? '');
  const [category, setCategory] = useState(row?.Category ?? 'progress');
  const [ttl, setTtl] = useState(row?.TtlMinutes ? String(row.TtlMinutes) : '');
  const [color, setColor] = useState(row?.Color ?? '');
  const [flags, setFlags] = useState({
    HidesPersonalData: row?.HidesPersonalData ?? false, RequiresOffer: row?.RequiresOffer ?? false,
    RequiresIssued: row?.RequiresIssued ?? false, IsExpiryTarget: row?.IsExpiryTarget ?? false, RevealsContacts: row?.RevealsContacts ?? false,
  });
  const [errors, setErrors] = useState<FieldErrors>({});

  const save = () => {
    if (!customer.ka.trim() || !partner.trim()) throw new ApiError(400, 'VALIDATION_ERROR', 'ტექსტები სავალდებულოა');
    return onSave({
      Key: key.trim(), CustomerKa: customer.ka, CustomerEn: customer.en || customer.ka, PartnerLabel: partner.trim(), ChipLabel: chip.trim() || partner.trim(),
      Category: category, TtlMinutes: ttl ? Number(ttl) : null, Color: color || null, Sort: row?.Sort ?? 0, ...flags,
    });
  };
  const flag = (k: keyof typeof flags, label: string, hint: string) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10 }} title={hint}>
      <Switch checked={flags[k]} onChange={(v) => setFlags((f) => ({ ...f, [k]: v }))} /> {label}
    </label>
  );

  return (
    <Dialog title={row ? `სტატუსი · ${row.Key}` : 'ახალი სტატუსი'} onOk={save} onClose={onClose} onErrors={setErrors}>
      <div className="fgrid" style={{ padding: 0 }}>
        <div className="f">
          <label htmlFor="sKey">გასაღები</label>
          <input id="sKey" value={key} placeholder="მაგ. on_hold" required onChange={(e) => setKey(e.target.value)} />
          <small>{row ? 'ჩანაწერებში გამოყენებულს ვერ შეცვლი' : 'lowercase ინგლისური, _'}</small>
          <FieldError errors={errors} field="Key" />
        </div>
        <div className="f">
          <label htmlFor="sColor">ფერი</label>
          <input id="sColor" value={color} placeholder="#f47429 (ცარიელი - ნაგულისხმევი)" onChange={(e) => setColor(e.target.value)} />
          <FieldError errors={errors} field="Color" />
        </div>
      </div>
      <div className="f">
        <label>მომხმარებლის საიტი</label>
        <BiInput value={customer} onChange={setCustomer} placeholder="სტატუსის ტექსტი" />
      </div>
      <div className="fgrid" style={{ padding: 0 }}>
        <div className="f">
          <label htmlFor="sP">პარტნიორის კაბინეტი</label>
          <input id="sP" value={partner} required onChange={(e) => setPartner(e.target.value)} />
        </div>
        <div className="f">
          <label htmlFor="sS">მოკლე (ჩიპი)</label>
          <input id="sS" value={chip} onChange={(e) => setChip(e.target.value)} />
        </div>
      </div>
      <div className="fgrid" style={{ padding: 0 }}>
        <div className="f">
          <label htmlFor="sCat">კატეგორია</label>
          <select id="sCat" value={category} onChange={(e) => setCategory(e.target.value as StatusRow['Category'])}>
            {STATUS_CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>
                {c.en} · {c.ka}
              </option>
            ))}
          </select>
          <FieldError errors={errors} field="Category" />
        </div>
        <div className="f">
          <label htmlFor="sT">ტაიმერი, წთ</label>
          <input id="sT" type="number" min={1} value={ttl} placeholder="ცარიელი - ვადის გარეშე" onChange={(e) => setTtl(e.target.value)} />
        </div>
      </div>
      <div className="f">
        <label>ქცევა</label>
        <div style={{ display: 'grid', gap: 8 }}>
          {flag('HidesPersonalData', 'პარტნიორი ვერ ხედავს განმცხადებლის მონაცემებს', 'მაგ. შემოსული')}
          {flag('RequiresOffer', 'გადასვლას სჭირდება მინიმუმ ერთი შეთავაზება', 'მაგ. შეთავაზება გაგზავნილია')}
          {flag('RequiresIssued', 'სჭირდება „სესხი გაცემულია"', 'მაგ. დასრულებული')}
          {flag('IsExpiryTarget', 'ვადის გასვლისას აქ გადადის (მხოლოდ ერთი)', 'მაგ. ვადაგასული')}
          {flag('RevealsContacts', 'პარტნიორს ეხსნება განმცხადებლის ტელეფონი და ელ.ფოსტა (სამუდამოდ)', 'მაგ. მომხმარებელმა დაადასტურა')}
        </div>
        <FieldError errors={errors} field="IsExpiryTarget" />
      </div>
    </Dialog>
  );
}

// ── transitions
interface Transition extends Base {
  FromStatusID: number;
  ToStatusID: number;
  Actor: string;
  ReasonKind: string | null;
  FromStatus: { ID: number; Key: string };
  ToStatus: { ID: number; Key: string };
}
const ACTORS: Record<string, string> = { customer: 'მომხმარებელი', partner: 'პარტნიორი', system: 'სისტემა', admin: 'ადმინი' };
const REASONS: Record<string, string> = { reject: 'უარის მიზეზი', cancel: 'გაუქმების მიზეზი' };

function TransitionsPage() {
  const { canWrite } = useAuth();
  const toast = useToast();
  const statuses = useAll<StatusRow>('status', { Sort: [{ Field: 'Sort', Dir: 'asc' }] });
  const [from, setFrom] = useState<number | ''>('');
  const q = useFind<Transition>('statusTransition', 1, 100, { Filter: from !== '' ? { FromStatusID: from } : {}, Sort: [{ Field: 'FromStatusID', Dir: 'asc' }] });
  const act = useRowActions('statusTransition');
  const writable = canWrite('statusTransition');
  const [dialog, setDialog] = useState(false);
  const [del, setDel] = useState<Transition | null>(null);
  const st = (id: number) => statuses.data?.find((s) => s.ID === id);
  const rows = [...(q.data?.Items ?? [])].sort((a, b) => (st(a.FromStatusID)?.Sort ?? 0) - (st(b.FromStatusID)?.Sort ?? 0) || (st(a.ToStatusID)?.Sort ?? 0) - (st(b.ToStatusID)?.Sort ?? 0));
  const Chip = ({ id }: { id: number }) => {
    const s = st(id);
    return (
      <span style={{ whiteSpace: 'nowrap' }}>
        <span className="dot" style={{ background: statusColor(s) }} />
        {s?.PartnerLabel ?? id} <code>{s?.Key}</code>
      </span>
    );
  };

  return (
    <ListPage
      title="პარამეტრები · გადასვლები"
      desc="ვის შეუძლია სტატუსის შეცვლა: საიდან, სად და ვინ (მომხმარებელი, პარტნიორი, სისტემა). პარტნიორის უარს და გაუქმებას მიზეზი სჭირდება ცნობარიდან."
      add={writable && <button type="button" className="btn btn-green" onClick={() => setDialog(true)}>+ გადასვლა</button>}
      filters={
        <select aria-label="საიდან" value={from} onChange={(e) => setFrom(e.target.value ? Number(e.target.value) : '')}>
          <option value="">ყველა სტატუსიდან</option>
          {(statuses.data ?? []).map((s) => (
            <option key={s.ID} value={s.ID}>
              {s.PartnerLabel}
            </option>
          ))}
        </select>
      }
    >
      <DataTable
        head={
          <tr>
            <th>საიდან</th>
            <th>სად</th>
            <th className="w5">ვინ</th>
            <th className="w5">მიზეზი</th>
            <th className="w2">აქტიური</th>
            <th className="acts" />
          </tr>
        }
      >
        {rows.length === 0 ? (
          <StateRow span={6} loading={q.isLoading} error={q.error?.message} />
        ) : (
          rows.map((t) => (
            <tr key={t.ID} className={t.IsEnable ? '' : 'inactive'}>
              <td>
                <Chip id={t.FromStatusID} />
              </td>
              <td>
                <Chip id={t.ToStatusID} />
              </td>
              <td>{ACTORS[t.Actor] ?? t.Actor}</td>
              <td>{t.ReasonKind ? REASONS[t.ReasonKind] : '-'}</td>
              <td>
                <Switch checked={t.IsEnable} disabled={!writable} onChange={(on) => act.enable.mutate({ r: t, on })} />
              </td>
              {writable ? <RowActions onDelete={() => setDel(t)} /> : <td className="acts" />}
            </tr>
          ))
        )}
      </DataTable>
      {dialog && <TransitionDialog statuses={statuses.data ?? []} defaultFrom={from} onSave={async (b) => (await act.save(null, b), toast('დაემატა'))} onClose={() => setDialog(false)} />}
      {del && (
        <Confirm
          title="წავშალოთ გადასვლა?"
          text={`${st(del.FromStatusID)?.PartnerLabel} → ${st(del.ToStatusID)?.PartnerLabel} (${ACTORS[del.Actor]})`}
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

function TransitionDialog({ statuses, defaultFrom, onSave, onClose }: { statuses: StatusRow[]; defaultFrom: number | ''; onSave: (b: object) => Promise<unknown>; onClose: () => void }) {
  const [from, setFrom] = useState<number | ''>(defaultFrom);
  const [to, setTo] = useState<number | ''>('');
  const [actor, setActor] = useState('partner');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const opts = statuses.map((s) => (
    <option key={s.ID} value={s.ID}>
      {s.PartnerLabel} ({s.Key})
    </option>
  ));
  return (
    <Dialog title="ახალი გადასვლა" okLabel="დამატება" onOk={() => onSave({ FromStatusID: from, ToStatusID: to, Actor: actor, ReasonKind: reason || null })} onClose={onClose} onErrors={setErrors}>
      <div className="fgrid" style={{ padding: 0 }}>
        <div className="f">
          <label htmlFor="tFrom">საიდან</label>
          <select id="tFrom" value={from} required onChange={(e) => setFrom(Number(e.target.value))}>
            <option value="" />
            {opts}
          </select>
          <FieldError errors={errors} field="FromStatusID" />
        </div>
        <div className="f">
          <label htmlFor="tTo">სად</label>
          <select id="tTo" value={to} required onChange={(e) => setTo(Number(e.target.value))}>
            <option value="" />
            {opts}
          </select>
          <FieldError errors={errors} field="ToStatusID" />
        </div>
      </div>
      <div className="fgrid" style={{ padding: 0 }}>
        <div className="f">
          <label htmlFor="tActor">ვინ</label>
          <select id="tActor" value={actor} onChange={(e) => setActor(e.target.value)}>
            {Object.entries(ACTORS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div className="f">
          <label htmlFor="tReason">მიზეზი</label>
          <select id="tReason" value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="">არ სჭირდება</option>
            {Object.entries(REASONS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
      </div>
    </Dialog>
  );
}

// ── OTP channels (setting "otp")
interface OtpChannel {
  On: boolean;
  Len: number;
  Ttl: number;
  Tries: number;
  Resend: number;
  Sender: string;
  Tpl: string;
}
interface Setting extends Base {
  Key: string;
  Value: { Sms: OtpChannel; Email: OtpChannel };
}
const OTP_CH = [
  { key: 'Sms', label: 'SMS', hint: 'კოდი მობილურზე' },
  { key: 'Email', label: 'EMAIL', hint: 'კოდი ელ.ფოსტაზე' },
] as const;

function OtpPage() {
  const { canWrite } = useAuth();
  const toast = useToast();
  const q = useFind<Setting>('setting', 1, 10, { Filter: { Search: 'otp' } });
  const act = useRowActions('setting');
  const writable = canWrite('setting');
  const s = q.data?.Items.find((x) => x.Key === 'otp');
  const [edit, setEdit] = useState<'Sms' | 'Email' | null>(null);

  const saveValue = async (value: Setting['Value']) => {
    if (!s) return;
    await act.save(s, { Key: 'otp', Value: value });
  };

  return (
    <ListPage
      title="პარამეტრები · OTP პარამეტრები"
      desc="ერთჯერადი კოდის არხები ავტორიზაციისთვის (მომხმარებელი, პარტნიორი, ადმინი). თითო არხს თავისი სიგრძე, ვადა, მცდელობების ლიმიტი, ხელახლა გაგზავნის ინტერვალი, გამგზავნი და შაბლონი აქვს. ერთი არხი მაინც უნდა იყოს ჩართული."
    >
      <DataTable
        head={
          <tr>
            <th className="w5">არხი</th>
            <th>გამგზავნი</th>
            <th className="num w3">სიგრძე</th>
            <th className="num w3">ვადა</th>
            <th className="num w3">მცდელობა</th>
            <th className="num w3">ხელახლა</th>
            <th className="w2">აქტიური</th>
            <th className="acts" />
          </tr>
        }
      >
        {!s ? (
          <StateRow span={8} loading={q.isLoading} error={q.error?.message} />
        ) : (
          OTP_CH.map(({ key, label, hint }) => {
            const c = s.Value[key];
            return (
              <tr key={key} className={c.On ? '' : 'inactive'}>
                <td>
                  <b style={{ fontWeight: 600 }}>{label}</b>
                  <span className="sub">{hint}</span>
                </td>
                <td>{c.Sender}</td>
                <td className="num">{c.Len} ციფრი</td>
                <td className="num">{c.Ttl} წმ</td>
                <td className="num">{c.Tries}</td>
                <td className="num">{c.Resend} წმ</td>
                <td>
                  <Switch
                    checked={c.On}
                    disabled={!writable}
                    onChange={(on) =>
                      saveValue({ ...s.Value, [key]: { ...c, On: on } })
                        .then(() => toast(on ? 'არხი ჩაირთო' : 'არხი გამოირთო'))
                        .catch((e) => toast(e.message))
                    }
                  />
                </td>
                {writable ? <RowActions onEdit={() => setEdit(key)} /> : <td className="acts" />}
              </tr>
            );
          })
        )}
      </DataTable>
      {edit && s && (
        <OtpDialog
          label={OTP_CH.find((c) => c.key === edit)!.label}
          channel={edit}
          value={s.Value[edit]}
          onSave={async (c) => {
            await saveValue({ ...s.Value, [edit]: c });
            toast('შენახულია');
          }}
          onClose={() => setEdit(null)}
        />
      )}
    </ListPage>
  );
}

function OtpDialog({ label, channel, value, onSave, onClose }: { label: string; channel: 'Sms' | 'Email'; value: OtpChannel; onSave: (c: OtpChannel) => Promise<void>; onClose: () => void }) {
  const [c, setC] = useState(value);
  const [errors, setErrors] = useState<FieldErrors>({});
  const num = (k: keyof OtpChannel) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setC({ ...c, [k]: Number(e.target.value) });
  const err = (f: string) => <FieldError errors={errors} field={`Value.${channel}.${f}`} />;
  return (
    <Dialog title={`OTP · ${label}`} onOk={() => onSave(c)} onClose={onClose} onErrors={setErrors}>
      <div className="f">
        <label htmlFor="oSender">{channel === 'Sms' ? 'გამგზავნი (sender / ნომერი)' : 'გამგზავნი ელ.ფოსტა'}</label>
        <input id="oSender" value={c.Sender} required onChange={(e) => setC({ ...c, Sender: e.target.value })} />
        {err('Sender')}
      </div>
      <div className="fgrid" style={{ padding: 0 }}>
        <div className="f">
          <label htmlFor="oLen">კოდის სიგრძე</label>
          <select id="oLen" value={c.Len} onChange={num('Len')}>
            {[4, 5, 6].map((n) => (
              <option key={n} value={n}>
                {n} ციფრი
              </option>
            ))}
          </select>
        </div>
        <div className="f">
          <label htmlFor="oTtl">მოქმედების ვადა, წმ</label>
          <input id="oTtl" type="number" min={30} value={c.Ttl} onChange={num('Ttl')} />
          {err('Ttl')}
        </div>
        <div className="f">
          <label htmlFor="oTries">მცდელობების ლიმიტი</label>
          <input id="oTries" type="number" min={1} max={10} value={c.Tries} onChange={num('Tries')} />
          {err('Tries')}
        </div>
        <div className="f">
          <label htmlFor="oResend">ხელახლა გაგზავნა, წმ</label>
          <input id="oResend" type="number" min={10} value={c.Resend} onChange={num('Resend')} />
          {err('Resend')}
        </div>
      </div>
      <div className="f">
        <label htmlFor="oTpl">შეტყობინების შაბლონი</label>
        <textarea id="oTpl" rows={2} value={c.Tpl} onChange={(e) => setC({ ...c, Tpl: e.target.value })} />
        <small>{'{code}'} - კოდის ადგილი</small>
        {err('Tpl')}
      </div>
    </Dialog>
  );
}

// ── notifications: who gets e-mail / SMS (the bell and browser notifications are always on)
interface NotifyValue {
  StaffEmail: boolean;
  StaffSms: boolean;
  CustomerEmail: boolean;
  CustomerSms: boolean;
}
const NOTIFY_DEFAULT: NotifyValue = { StaffEmail: true, StaffSms: false, CustomerEmail: false, CustomerSms: true };
const NOTIFY_ROWS: { who: string; when: string; email: keyof NotifyValue; sms: keyof NotifyValue }[] = [
  { who: 'პარტნიორის თანამშრომლები', when: 'ახალი განაცხადი (თავისი ქალაქები / პროდუქტები)', email: 'StaffEmail', sms: 'StaffSms' },
  { who: 'მომხმარებელი', when: 'ორგანიზაციამ შეთავაზება გამოუგზავნა', email: 'CustomerEmail', sms: 'CustomerSms' },
];

function NotifyPage() {
  const { canWrite } = useAuth();
  const toast = useToast();
  const q = useFind<{ ID: number; UID: string; Key: string; Value: NotifyValue }>('setting', 1, 10, { Filter: { Search: 'notify' } });
  const act = useRowActions('setting');
  const writable = canWrite('setting');
  const s = q.data?.Items.find((x) => x.Key === 'notify');
  const v = { ...NOTIFY_DEFAULT, ...(s?.Value ?? {}) };
  const set = async (k: keyof NotifyValue, on: boolean) => {
    try {
      await act.save(s ?? null, { Key: 'notify', Value: { ...v, [k]: on } });
      toast('შენახულია');
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'შეცდომა');
    }
  };
  return (
    <ListPage
      title="პარამეტრები · შეტყობინებები"
      desc="ვის მიუვიდეს ელ.ფოსტა / SMS განაცხადებზე. ზარი (კაბინეტში) და ბრაუზერის შეტყობინებები ყოველთვის ჩართულია; მომხმარებელი ბრაუზერის შეტყობინებებს თავად რთავს."
    >
      <DataTable
        head={
          <tr>
            <th>ვის</th>
            <th>როდის</th>
            <th className="w3">ელ.ფოსტა</th>
            <th className="w3">SMS</th>
          </tr>
        }
      >
        {q.isLoading ? (
          <StateRow span={4} loading />
        ) : (
          NOTIFY_ROWS.map((r) => (
            <tr key={r.who}>
              <td>
                <b style={{ fontWeight: 600 }}>{r.who}</b>
              </td>
              <td>{r.when}</td>
              <td>
                <Switch checked={v[r.email]} disabled={!writable} onChange={(on) => set(r.email, on)} />
              </td>
              <td>
                <Switch checked={v[r.sms]} disabled={!writable} onChange={(on) => set(r.sms, on)} />
              </td>
            </tr>
          ))
        )}
      </DataTable>
    </ListPage>
  );
}

// ── the customers' site PIN: how many digits
function PinPage() {
  const { canWrite } = useAuth();
  const toast = useToast();
  const q = useFind<{ ID: number; UID: string; Key: string; Value: { length: number } }>('setting', 1, 10, { Filter: { Search: 'pin' } });
  const act = useRowActions('setting');
  const writable = canWrite('setting');
  const s = q.data?.Items.find((x) => x.Key === 'pin');
  const length = s?.Value?.length ?? 4;
  const set = async (n: number) => {
    try {
      await act.save(s ?? null, { Key: 'pin', Value: { length: n } });
      toast('შენახულია');
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'შეცდომა');
    }
  };
  return (
    <ListPage
      title="პარამეტრები · PIN-კოდი"
      desc="მომხმარებლის PIN-კოდი (შესვლა ელ.ფოსტით და PIN-ით). სიგრძე ეხება ახალ და შეცვლილ PIN-ებს - უკვე დაყენებული PIN თავის სიგრძეს ინარჩუნებს, სანამ მომხმარებელი არ შეცვლის."
    >
      <DataTable
        head={
          <tr>
            <th>პარამეტრი</th>
            <th className="w3">მნიშვნელობა</th>
          </tr>
        }
      >
        {q.isLoading ? (
          <StateRow span={2} loading />
        ) : (
          <tr>
            <td>
              <b style={{ fontWeight: 600 }}>PIN-ის სიგრძე</b>
              <span className="sub">რამდენი ციფრი - კლავიატურაზე ზუსტად ამდენი წერტილი ჩანს</span>
            </td>
            <td>
              <select aria-label="PIN-ის სიგრძე" value={length} disabled={!writable} onChange={(e) => void set(Number(e.target.value))}>
                {[4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    {n} ციფრი
                  </option>
                ))}
              </select>
            </td>
          </tr>
        )}
      </DataTable>
    </ListPage>
  );
}
