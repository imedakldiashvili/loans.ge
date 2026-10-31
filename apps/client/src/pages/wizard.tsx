import { n, t, up } from '../i18n';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, Ref } from '../api';
import { OtpModal, useAskLogin } from '../auth';
import { CATEGORIES, OrgLogo, useRefs, useSession } from '../session';
import { Chevron, fmt, fmtPhone, money } from '../ui';
import { AmountPicker, Start } from './home';

// Application wizard (prototype #wizard): amount and organisations → credit history → sector → incomes → banks → personal data.
// Personal data needs a login (the application belongs to the account); the phone is confirmed with an SMS code
// unless it is the account's own phone. POST /client/application/add.

export interface Sent {
  ref: Ref;
  amount: string;
  loan: string;
  orgs: number;
}

const STEPS = 6;

export function Wizard({ start, onSent }: { start: Start; onSent: (s: Sent) => void }) {
  const { me } = useSession();
  const go = useNavigate();
  const askLogin = useAskLogin();
  const refs = useRefs();
  const [step, setStep] = useState(1);
  // the amount: the first step, with the organisations that lend it (as the quick form had it), starting from what the start brought
  const [amt, setAmt] = useState({ amount: start.amount, currency: start.currency });
  const onAmount = useCallback((amount: number, currency: string) => setAmt({ amount, currency }), []);
  const [credit, setCredit] = useState('');
  const [sector, setSector] = useState('');
  const [incomes, setIncomes] = useState<Record<string, string>>({}); // source name → amount (checked when present)
  const [banks, setBanks] = useState<string[]>([]);
  const [orgs, setOrgs] = useState<number[]>([]);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [p, setP] = useState({ pid: '', first: '', last: '', dob: '', city: '', district: '', village: '', phone: '' });
  const [otp, setOtp] = useState(false);
  const pt = start.productType;

  const total = Object.values(incomes).reduce((t, v) => t + (Number(v) || 0), 0);
  const cityDistricts = refs.districts.filter((d) => String(d.CityID) === p.city);
  // only organisations that take this loan and lend this amount
  const lends = (x: { MinAmount: number | string | null; MaxAmount: number | string | null }) => (x.MinAmount === null || Number(x.MinAmount) <= amt.amount) && (x.MaxAmount === null || Number(x.MaxAmount) >= amt.amount);
  const accepting = refs.organizations.filter((o) => o.IsPartner && o.ProductTypes.some((x) => x.ProductTypeID === pt.ID && lends(x)));
  const bankList = refs.organizations.filter((o) => o.Category === 'bank');
  // a changed amount: drop the organisations that no longer lend it
  useEffect(() => {
    setOrgs((x) => x.filter((id) => accepting.some((o) => o.ID === id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amt.amount]);
  const valid = (n: number) =>
    n === 1 ? amt.amount > 0 && orgs.length > 0
    : n === 2 ? !!credit
    : n === 3 ? !!sector
    : n === 4 ? Object.keys(incomes).length > 0
    : n === 5 ? true // banks are optional
    : /^\d{11}$/.test(p.pid) && !!p.first.trim() && !!p.last.trim() && !!p.dob && !!p.city && /^5\d{8}$/.test(p.phone);

  // personal data needs an account: ask to log in, then fill from the profile
  useEffect(() => {
    if (step !== STEPS) return;
    let gone = false;
    (async () => {
      if (!me && !(await askLogin())) return !gone && setStep(STEPS - 1);
      try {
        const m = me ?? (await api<{ Profile: Ref | null; User: { Phone: string | null } }>('GET', '/client/auth/me'));
        if (!m.Profile) return;
        const d = await api<{ Customer: { Pid: string | null; FirstName: string | null; LastName: string | null; BirthDate: string | null; CityID: number | null; DistrictID: number | null; Village: string | null } | null }>(
          'GET',
          `/client/profile/detail/${m.Profile.ID}/${m.Profile.UID}`,
        );
        const c = d.Customer;
        if (gone) return;
        setP((x) => ({
          pid: x.pid || c?.Pid || '', first: x.first || c?.FirstName || '', last: x.last || c?.LastName || '', dob: x.dob || c?.BirthDate?.slice(0, 10) || '',
          city: x.city || (c?.CityID ? String(c.CityID) : ''), district: x.district || (c?.DistrictID ? String(c.DistrictID) : ''), village: x.village || c?.Village || '',
          phone: x.phone || m.User.Phone || '',
        }));
      } catch {
        /* prefill is a convenience */
      }
    })();
    return () => {
      gone = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);
  useEffect(() => {
    document.querySelector('.wizard')?.scrollIntoView({ block: 'start' });
  }, [step]);

  const body = (code?: { ref: Ref; code: string }) => ({
    ProductTypeID: pt.ID, Amount: amt.amount, Currency: amt.currency, CreditHistory: credit, Sector: sector,
    Incomes: Object.entries(incomes).map(([Src, v]) => ({ Src, Amount: Number(v) || 0 })), Banks: banks, OrganizationIDs: orgs,
    Pid: p.pid, FirstName: p.first.trim(), LastName: p.last.trim(), BirthDate: p.dob, Phone: p.phone,
    CityID: Number(p.city), DistrictID: p.district ? Number(p.district) : null, Village: p.village.trim() || null,
    ...(code ? { Otp: { ID: code.ref.ID, UID: code.ref.UID, Code: code.code } } : {}),
  });
  const sent = (ref: Ref) => onSent({ ref, amount: money(amt.amount, amt.currency), loan: n(pt), orgs: orgs.length });

  const next = async () => {
    if (!valid(step)) return;
    if (step < STEPS) return setStep(step + 1);
    if (!me && !(await askLogin())) return;
    // before sending: an SMS code to the application's phone — every time, also the account's own phone
    setOtp(true);
  };

  // back: the previous step; on the first one — the page the wizard was opened from (home without one)
  const back = () => (step > 1 ? setStep(step - 1) : (window.history.state?.idx ?? 0) > 0 ? go(-1) : go('/'));

  const nav = (cls: string) => (
    <>
      <button type="button" className="btn btn-ghost" onClick={back}>
        {cls === 'head' && (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        )}
        <span>{t('უკან')}</span>
      </button>
      {cls === 'head' && (
        <ol className="wz-steps">
          {Array.from({ length: STEPS }, (_, i) => (
            <li key={i} className={i === step - 1 ? 'on' : i < step - 1 ? 'done' : ''}>
              <span>{String(i + 1).padStart(2, '0')}</span>
              <i />
            </li>
          ))}
        </ol>
      )}
      <button type="button" className="btn btn-green" disabled={!valid(step)} onClick={next}>
        <span>{t(step === STEPS ? 'გაგზავნა' : 'გაგრძელება')}</span>
        {cls === 'head' && (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 6l6 6-6 6" />
          </svg>
        )}
      </button>
    </>
  );
  const radios = (name: string, list: { NameKa: string }[], value: string, set: (v: string) => void) => (
    <div className="opt-list" role="radiogroup">
      {list.map((x) => (
        <label key={x.NameKa} className="opt-row">
          <input type="radio" name={name} checked={value === x.NameKa} onChange={() => set(x.NameKa)} />
          <i />
          {n(x)}
        </label>
      ))}
    </div>
  );
  const setField = (k: keyof typeof p) => (e: { target: { value: string } }) => setP({ ...p, [k]: e.target.value });

  return (
    <section className="wizard">
      <div className="wrap">
        <div className="wz-summary">
          <b>{n(pt)}</b>
          <b id="wzAmount">{money(amt.amount, amt.currency)}</b>
        </div>
        <div className="wz-head">{nav('head')}</div>
        <div className="wz-body">
          {step === 2 && (
            <div className="wz-panel">
              <h2 className="sec-title">{up(t('საკრედიტო ისტორია'))}</h2>
              <div className="wz-form">{radios('credit', refs.creditHistory, credit, setCredit)}</div>
            </div>
          )}
          {step === 3 && (
            <div className="wz-panel">
              <h2 className="sec-title">{up(t('საქმიანობის სფერო'))}</h2>
              <div className="wz-form">{radios('sector', refs.sectors, sector, setSector)}</div>
            </div>
          )}
          {step === 4 && (
            <div className="wz-panel">
              <h2 className="sec-title">{up(t('შემოსავლის წყარო'))}</h2>
              <div className="wz-form">
                <div className="inc-list">
                  {refs.incomeSources.map((s) => {
                    const on = s.NameKa in incomes;
                    return (
                      <div key={s.ID} className="inc">
                        <label className="inc-check">
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={(e) => {
                              const next = { ...incomes };
                              if (e.target.checked) next[s.NameKa] = '';
                              else delete next[s.NameKa];
                              setIncomes(next);
                            }}
                          />
                          <i />
                          {n(s)}
                        </label>
                        {on && (
                          <div className="inc-amt">
                            <input type="number" min={0} step={50} inputMode="numeric" placeholder={t('თვიური თანხა')} aria-label={`${n(s)}, ${t('თვიური თანხა')}`} value={incomes[s.NameKa]} onChange={(e) => setIncomes({ ...incomes, [s.NameKa]: e.target.value })} autoFocus />
                            <span>₾</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="inc-total">
                  <span>{t('ჯამური თვიური შემოსავალი')}</span>
                  <b>{fmt(total)} ₾</b>
                </div>
              </div>
            </div>
          )}
          {step === 5 && (
            <div className="wz-panel">
              <h2 className="sec-title">{up(t('რომელი ბანკის სერვისებით სარგებლობთ'))}</h2>
              <div className="wz-form">
                <div className="opt-list banks-list" role="group" aria-label={t('ბანკის სერვისები')}>
                  {bankList.map((b) => (
                    <label key={b.ID} className="opt-row opt-check">
                      <input type="checkbox" checked={banks.includes(b.NameKa)} onChange={(e) => setBanks(e.target.checked ? [...banks, b.NameKa] : banks.filter((x) => x !== b.NameKa))} />
                      <i />
                      <OrgLogo org={b} />
                      {n(b)}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}
          {step === 1 && (
            <div className="wz-panel">
              <h2 className="sec-title">{up(t('სესხის თანხა'))}</h2>
              <div className="wz-form wz-form-wide">
                <div className="calc wz-amount">
                  <AmountPicker pt={pt} amount={amt.amount} currency={amt.currency} onChange={onAmount} />
                </div>
              </div>
              {/* the organisations that lend the amount chosen above — their numbers follow it */}
              <h3 className="wz-subtitle">{t('ორგანიზაციების სია')}</h3>
              <p className="wz-note">{t('მონიშნე ორგანიზაციები, რომლებსაც გინდა განაცხადი გაუგზავნო.')}</p>
              <div className="wz-form wz-form-wide">
                <div className="org-groups">
                  {CATEGORIES.map(([cat, label]) => {
                    const list = accepting.filter((o) => o.Category === cat);
                    if (!list.length) return null;
                    const cnt = list.filter((o) => orgs.includes(o.ID)).length;
                    const isOpen = open.has(cat);
                    return (
                      <div key={cat} className="org-group">
                        <div className="org-head">
                          <label className="org-all-check">
                            <input
                              type="checkbox"
                              className="org-all"
                              checked={cnt === list.length}
                              ref={(el) => {
                                if (el) el.indeterminate = cnt > 0 && cnt < list.length;
                              }}
                              onChange={(e) => {
                                const ids = list.map((o) => o.ID);
                                setOrgs(e.target.checked ? [...new Set([...orgs, ...ids])] : orgs.filter((x) => !ids.includes(x)));
                              }}
                            />
                            <i />
                            <h3>{t(label)}</h3>
                          </label>
                          <span className={`org-cnt${cnt ? '' : ' none'}`}>
                            {cnt}/{list.length}
                          </span>
                          <button
                            type="button"
                            className="org-toggle"
                            aria-expanded={isOpen}
                            aria-label={t('ჩამოშლა')}
                            onClick={() => {
                              const s = new Set(open);
                              if (isOpen) s.delete(cat);
                              else s.add(cat);
                              setOpen(s);
                            }}
                          >
                            <Chevron />
                          </button>
                        </div>
                        {isOpen && (
                          <div className="org-list">
                            {list.map((o) => (
                              <label key={o.ID} className="org">
                                <input type="checkbox" checked={orgs.includes(o.ID)} onChange={(e) => setOrgs(e.target.checked ? [...orgs, o.ID] : orgs.filter((x) => x !== o.ID))} />
                                <i />
                                <OrgLogo org={o} />
                                {n(o)}
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {!accepting.length && <p className="wz-note">{t('ამ პროდუქტზე და თანხაზე პარტნიორი ორგანიზაცია არ არის.')}</p>}
                </div>
                <div className="org-total">
                  <span>{t('არჩეულია')}</span>
                  <b>{orgs.length}</b>
                </div>
              </div>
            </div>
          )}
          {step === 6 && (
            <div className="wz-panel">
              <h2 className="sec-title">{up(t('პირადი მონაცემები'))}</h2>
              <div className="wz-form">
                <div className="f-grid">
                  <div className="f">
                    <label htmlFor="pPid">{t('პირადი ნომერი')}</label>
                    <input type="text" id="pPid" inputMode="numeric" maxLength={11} placeholder={t('11 ციფრი')} value={p.pid} onChange={(e) => setP({ ...p, pid: e.target.value.replace(/\D/g, '').slice(0, 11) })} />
                  </div>
                  <div className="f">
                    <label htmlFor="pFirst">{t('სახელი')}</label>
                    <input type="text" id="pFirst" autoComplete="given-name" value={p.first} onChange={setField('first')} />
                  </div>
                  <div className="f">
                    <label htmlFor="pLast">{t('გვარი')}</label>
                    <input type="text" id="pLast" autoComplete="family-name" value={p.last} onChange={setField('last')} />
                  </div>
                  <div className="f">
                    <label htmlFor="pDob">{t('დაბადების თარიღი')}</label>
                    <input type="date" id="pDob" max="2010-12-31" min="1930-01-01" value={p.dob} onChange={setField('dob')} />
                  </div>
                  <div className="f">
                    <label htmlFor="pCity">{t('ქალაქი')}</label>
                    <select id="pCity" value={p.city} onChange={(e) => setP({ ...p, city: e.target.value, district: '', village: '' })}>
                      <option value="" disabled>
                        {t('აირჩიეთ')}
                      </option>
                      {refs.cities.map((c) => (
                        <option key={c.ID} value={c.ID}>
                          {n(c)}
                        </option>
                      ))}
                    </select>
                  </div>
                  {cityDistricts.length > 0 ? (
                    <div className="f">
                      <label htmlFor="pDistrict">{t('უბანი')}</label>
                      <select id="pDistrict" value={p.district} onChange={setField('district')}>
                        <option value="">{t('აირჩიეთ')}</option>
                        {cityDistricts.map((d) => (
                          <option key={d.ID} value={d.ID}>
                            {n(d)}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="f">
                      <label htmlFor="pVillage">{t('უბანი / სოფელი')}</label>
                      <input type="text" id="pVillage" autoComplete="address-level3" value={p.village} disabled={!p.city} onChange={setField('village')} />
                    </div>
                  )}
                  <div className="f">
                    <label htmlFor="pPhone">{t('მობილური ნომერი')}</label>
                    <div className="phone">
                      <span>+995</span>
                      <input type="tel" id="pPhone" inputMode="numeric" maxLength={9} placeholder="5XX XXX XXX" autoComplete="tel-national" value={p.phone} onChange={(e) => setP({ ...p, phone: e.target.value.replace(/\D/g, '').slice(0, 9) })} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="wz-foot">{nav('foot')}</div>
      </div>
      {otp && (
        <OtpModal
          where="კოდი გაიგზავნა ნომერზე"
          target={fmtPhone(p.phone)}
          send={() => api<Ref>('POST', '/client/application/sendPhoneOtp', { Phone: p.phone })}
          verify={async (ref, code) => {
            const r = await api<Ref>('POST', '/client/application/add', body({ ref, code }));
            setOtp(false);
            sent(r);
          }}
          onClose={() => setOtp(false)}
        />
      )}
    </section>
  );
}
