import { n, t, up } from '../i18n';
import { useEffect, useState } from 'react';
import { api, ApiError, Ref } from '../api';
import { OtpModal, useAskLogin } from '../auth';
import { CATEGORIES, orgColor, orgMark, useRefs, useSession } from '../session';
import { Chevron, ErrorText, fmt, fmtPhone, money } from '../ui';
import { Start } from './home';

// Application wizard (prototype #wizard): credit history → sector → incomes → banks → organisations → personal data.
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
  const askLogin = useAskLogin();
  const refs = useRefs();
  const [step, setStep] = useState(1);
  const [credit, setCredit] = useState('');
  const [sector, setSector] = useState('');
  const [incomes, setIncomes] = useState<Record<string, string>>({}); // source name → amount (checked when present)
  const [banks, setBanks] = useState<string[]>([]);
  const [orgs, setOrgs] = useState<number[]>([]);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [p, setP] = useState({ pid: '', first: '', last: '', dob: '', city: '', district: '', village: '', phone: '' });
  const [otp, setOtp] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pt = start.productType;

  const total = Object.values(incomes).reduce((t, v) => t + (Number(v) || 0), 0);
  const cityDistricts = refs.districts.filter((d) => String(d.CityID) === p.city);
  const accepting = refs.organizations.filter((o) => o.IsPartner && o.ProductTypes.some((x) => x.ProductTypeID === pt.ID));
  const bankList = refs.organizations.filter((o) => o.Category === 'bank');
  const valid = (n: number) =>
    n === 1 ? !!credit
    : n === 2 ? !!sector
    : n === 3 ? Object.keys(incomes).length > 0
    : n === 4 ? true // banks are optional
    : n === 5 ? orgs.length > 0
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
    ProductTypeID: pt.ID, Amount: start.amount, Currency: start.currency, CreditHistory: credit, Sector: sector,
    Incomes: Object.entries(incomes).map(([Src, v]) => ({ Src, Amount: Number(v) || 0 })), Banks: banks, OrganizationIDs: orgs,
    Pid: p.pid, FirstName: p.first.trim(), LastName: p.last.trim(), BirthDate: p.dob, Phone: p.phone,
    CityID: Number(p.city), DistrictID: p.district ? Number(p.district) : null, Village: p.village.trim() || null,
    ...(code ? { Otp: { ID: code.ref.ID, UID: code.ref.UID, Code: code.code } } : {}),
  });
  const sent = (ref: Ref) => onSent({ ref, amount: money(start.amount, start.currency), loan: n(pt), orgs: orgs.length });
  const errText = (e: unknown) => (e instanceof ApiError ? [e.message, ...e.details.map((d) => d.Message)].join(' — ') : t('შეცდომა'));

  const next = async () => {
    if (!valid(step)) return;
    if (step < STEPS) return setStep(step + 1);
    if (!me && !(await askLogin())) return;
    setError('');
    // the account's own phone is already confirmed — otherwise an SMS code first
    const own = (me ?? (await api<{ User: { Phone: string | null } }>('GET', '/client/auth/me'))).User.Phone === p.phone;
    if (!own) return setOtp(true);
    setBusy(true);
    try {
      sent(await api<Ref>('POST', '/client/application/add', body()));
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };

  const nav = (cls: string) => (
    <>
      <button type="button" className="btn btn-ghost" disabled={step === 1} onClick={() => setStep(step - 1)}>
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
      <button type="button" className="btn btn-green" disabled={!valid(step) || busy} onClick={next}>
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
          <b id="wzAmount">{money(start.amount, start.currency)}</b>
        </div>
        <div className="wz-head">{nav('head')}</div>
        <div className="wz-body">
          {step === 1 && (
            <div className="wz-panel">
              <h2 className="sec-title">{up(t('საკრედიტო ისტორია'))}</h2>
              <div className="wz-form">{radios('credit', refs.creditHistory, credit, setCredit)}</div>
            </div>
          )}
          {step === 2 && (
            <div className="wz-panel">
              <h2 className="sec-title">{up(t('საქმიანობის სფერო'))}</h2>
              <div className="wz-form">{radios('sector', refs.sectors, sector, setSector)}</div>
            </div>
          )}
          {step === 3 && (
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
          {step === 4 && (
            <div className="wz-panel">
              <h2 className="sec-title">{up(t('რომელი ბანკის სერვისებით სარგებლობთ'))}</h2>
              <div className="wz-form">
                <div className="opt-list banks-list" role="group" aria-label={t('ბანკის სერვისები')}>
                  {bankList.map((b) => (
                    <label key={b.ID} className="opt-row opt-check">
                      <input type="checkbox" checked={banks.includes(b.NameKa)} onChange={(e) => setBanks(e.target.checked ? [...banks, b.NameKa] : banks.filter((x) => x !== b.NameKa))} />
                      <i />
                      {n(b)}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}
          {step === 5 && (
            <div className="wz-panel">
              <h2 className="sec-title">{up(t('ორგანიზაციების არჩევა'))}</h2>
              <p className="wz-note">{t('მონიშნე ორგანიზაციები, რომლებსაც გინდა განაცხადი გაუგზავნო. თითოეული ცალ-ცალკე მოგცემს შეთავაზებას.')}</p>
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
                          {cnt > 0 && (
                            <span className="org-cnt">
                              {cnt}/{list.length}
                            </span>
                          )}
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
                                <span className="lg" style={{ ['--c' as string]: orgColor(o) }}>
                                  {orgMark(o.NameKa)}
                                </span>
                                {n(o)}
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {!accepting.length && <p className="wz-note">{t('ამ პროდუქტზე პარტნიორი ორგანიზაცია ჯერ არ არის.')}</p>}
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
                <ErrorText error={error} />
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
