import { lang, n, t, up } from '../i18n';
import { useQuery } from '@tanstack/react-query';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { CATEGORIES, OrgLogo, ProductType, useRefs } from '../session';
import { fmt } from '../ui';

// Home page (prototype hero, #how, .advsec), quick form, partners / terms / about pages.

export interface Start {
  productType: ProductType;
  amount: number;
  currency: string;
}

const short = (n: number) => (n >= 1e6 ? `${n / 1e6}M` : n >= 1e3 ? `${n / 1e3}K` : String(n));

/** Loan purpose, amount range + slider, currency → "შეავსე განაცხადი" (prototype #quick). */
export function QuickForm({ onSubmit, initial }: { onSubmit: (s: Start) => void; initial?: number }) {
  const { productTypes, currencies } = useRefs();
  const [ptId, setPtId] = useState<number | null>(initial ?? null);
  const pt = productTypes.find((p) => p.ID === ptId) ?? productTypes[0];
  // ranges: min → 10×min, ten steps (moneymarket.ge); only ranges the product allows
  const ranges = (pt?.AmountRanges?.length ? pt.AmountRanges : [100, 1000, 10000]).filter((r) => !pt || r < pt.MaxAmount);
  const [range, setRange] = useState(1000);
  const [value, setValue] = useState(5000);
  const [cur, setCur] = useState('GEL');
  const [curOpen, setCurOpen] = useState(false);
  const curRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (initial) setPtId(initial);
  }, [initial]);

  const r = ranges.includes(range) ? range : ranges[Math.min(1, ranges.length - 1)] ?? 1000;
  const min = Math.max(r, pt?.MinAmount ?? 0);
  const max = Math.min(r * 10, pt?.MaxAmount ?? r * 10);
  // the scale under the slider: from the product's min to its max (e.g. quick loan 1K+ → 1K … 3K, not 10K);
  // a short one gets finer marks — at least 4 gaps (1K, 1.5K, … 3K; 100K, 110K, … 150K)
  const tickStep = [r, r / 2, r / 5, r / 10].find((s) => (max - min) / s >= 4 && (max - min) % s === 0) ?? r / 10;
  const ticks = Array.from({ length: Math.floor((max - min) / tickStep) + 1 }, (_, i) => min + i * tickStep);
  if (ticks[ticks.length - 1] !== max) ticks.push(max);
  const v = Math.min(Math.max(value, min), max);
  const p = max > min ? ((v - min) / (max - min)) * 100 : 0;
  const curs = currencies.length ? currencies : [{ ID: 0, Code: 'GEL', Symbol: '₾' }];
  const sym = curs.find((c) => c.Code === cur)?.Symbol ?? '₾';

  useEffect(() => {
    const close = (e: MouseEvent) => !curRef.current?.contains(e.target as Node) && setCurOpen(false);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (pt) onSubmit({ productType: pt, amount: v, currency: cur });
  };
  return (
    <form className="calc" aria-label={t('სესხის განაცხადი')} onSubmit={submit}>
      <select required aria-label={t('მიზნობრიობა')} value={pt?.ID ?? ''} onChange={(e) => setPtId(Number(e.target.value))}>
        {productTypes.map((x) => (
          <option key={x.ID} value={x.ID}>
            {n(x)}
          </option>
        ))}
      </select>
      <div className="amount">
        <div className="ranges">
          {ranges.map((x) => (
            <button
              key={x}
              type="button"
              className={x === r ? 'on' : ''}
              onClick={() => {
                setRange(x);
                setValue(x);
              }}
            >
              {fmt(x)} +
            </button>
          ))}
        </div>
        <div className="box">
          <strong>{fmt(v)}</strong>
          <div className="cur" ref={curRef}>
            <button type="button" aria-haspopup="listbox" aria-expanded={curOpen} aria-label={t('ვალუტა')} onClick={() => setCurOpen(!curOpen)}>
              {sym}
            </button>
            {curOpen && (
              <ul role="listbox">
                {curs.map((c) => (
                  <li
                    key={c.Code}
                    role="option"
                    aria-selected={c.Code === cur}
                    onClick={() => {
                      setCur(c.Code);
                      setCurOpen(false);
                    }}
                  >
                    <b>{c.Symbol}</b> {t(({ GEL: 'ლარი', USD: 'დოლარი', EUR: 'ევრო' } as Record<string, string>)[c.Code] ?? c.Code)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
      <input type="range" min={min} max={max} step={Math.max(1, r / 10)} value={v} aria-label={t('თანხა')} style={{ ['--p' as string]: `${p}%` }} onChange={(e) => setValue(Number(e.target.value))} />
      <div className="ticks">
        {ticks.map((x) => (
          <span key={x}>{short(x)}</span>
        ))}
      </div>
      <button type="submit" className="btn btn-green full" disabled={!pt}>
        {t('შეავსე განაცხადი')}
      </button>
    </form>
  );
}

export function Home({ onStart, purpose }: { onStart: (s: Start) => void; purpose?: number }) {
  const stats = useQuery({ queryKey: ['public', 'stats'], queryFn: () => api<{ Applications: number; Customers: number; Organizations: number }>('GET', '/public/stats/summary'), staleTime: 60_000 }).data;
  return (
    <>
      <section className="hero">
        <div className="wrap">
          <div className="hero-text">
            <h1>{up(t('აირჩიე სესხი საუკეთესო პირობებით'))}</h1>
            <p>{t('შეავსე ერთი განაცხადი და მიიღე შეთავაზებები რამდენიმე საფინანსო ორგანიზაციისგან. შეადარე პროცენტი, ვადა და ყოველთვიური გადასახადი ერთ გვერდზე.')}</p>
            <div className="stats">
              <div className="stat">
                <i>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                    <path d="M14 3v6h6M9 13h6M9 17h6" />
                  </svg>
                </i>
                <b>{fmt(stats?.Applications ?? 0)}</b>
                <span>
                  {t('შევსებული')}
                  <br />
                  {lang() === 'en' ? 'applications' : 'განაცხადი'}
                </span>
              </div>
              <div className="stat">
                <i>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="9" cy="8" r="3.5" />
                    <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
                    <circle cx="17" cy="9" r="2.5" />
                    <path d="M15.5 20h6a5 5 0 0 0-4-4.8" />
                  </svg>
                </i>
                <b>{fmt(stats?.Customers ?? 0)}</b>
                <span>
                  {t('რეგისტრირებული')}
                  <br />
                  {lang() === 'en' ? 'users' : 'მომხმარებელი'}
                </span>
              </div>
              <div className="stat">
                <i>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 21h18M5 21V7l7-4 7 4v14" />
                    <path d="M9 21v-4h6v4M9 11h2M13 11h2M9 15h2M13 15h2" />
                  </svg>
                </i>
                <b>{fmt(stats?.Organizations ?? 0)}</b>
                <span>
                  {t('პარტნიორი')}
                  <br />
                  {t('ორგანიზაცია')}
                </span>
              </div>
            </div>
          </div>
          <div className="hero-side">
            <QuickForm onSubmit={onStart} initial={purpose} />
          </div>
        </div>
      </section>
      <section id="how">
        <div className="wrap">
          <h2 className="sec-title">{up(t('აირჩიე საუკეთესო შეთავაზება'))}</h2>
          <div className="steps">
            <article className="step">
              <div className="num n1">01</div>
              <h3>{t('შეავსე განაცხადი')}</h3>
              <p>{t('შეავსე განაცხადი, აირჩიე სასურველი ორგანიზაციები და მიიღე ონლაინ შეთავაზებები')}</p>
            </article>
            <article className="step">
              <div className="num n2">02</div>
              <h3>{t('აირჩიე საუკეთესო')}</h3>
              <p>{t('შეადარე შეთავაზებები და დაეთანხმე შენთვის სასურველ პირობებს')}</p>
            </article>
          </div>
        </div>
      </section>
      <section className="advsec">
        <div className="wrap">
          <h2 className="sec-title">{up(t('უპირატესობები'))}</h2>
          <div className="adv">
            <div>
              <h3>{t('აირჩიე საუკეთესო')}</h3>
              <p>{t('გაწვდით შენი მოთხოვნის შესაბამის ყველა შეთავაზებას. შენ თვითონ ადარებ და ირჩევ შენთვის ყველაზე მისაღებ პირობებს.')}</p>
            </div>
            <div>
              <h3>{t('დაზოგე დრო')}</h3>
              <p>{t('სრულიად ციფრული პროცესი, არანაირი ბიუროკრატია და დამატებითი დანახარჯები. ერთი განაცხადი — რამდენიმე შეთავაზება.')}</p>
            </div>
            <div>
              <h3>{t('შენი ერთგული პარტნიორი')}</h3>
              <p>{t('გვსურს გრძელვადიანი პარტნიორობა. ამიტომ მუდმივად ვეძებთ შენთვის საუკეთესო წინადადებებს და გაძლევთ არჩევანის მეტ თავისუფლებას.')}</p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

const CAT_ICONS: Record<string, JSX.Element> = {
  bank: <path d="M3 10l9-6 9 6M5 10v9M9 10v9M15 10v9M19 10v9M3 19h18" />,
  mfo: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v10M9.5 9.5h3.75a1.75 1.75 0 0 1 0 3.5H10.5a1.75 1.75 0 0 0 0 3.5h4" />
    </>
  ),
  leasing: (
    <>
      <path d="M5 17h14l1-6-2-5H6L4 11z" />
      <circle cx="7.5" cy="17" r="2" />
      <circle cx="16.5" cy="17" r="2" />
    </>
  ),
  lender: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M7 12h.01M17 12h.01" />
    </>
  ),
};

export function PartnersPage() {
  const { organizations } = useRefs();
  const partners = organizations.filter((o) => o.IsPartner);
  return (
    <section className="partners">
      <div className="wrap">
        <h2 className="sec-title">{up(t('პარტნიორი ორგანიზაციები'))}</h2>
        <div className="cats">
          {CATEGORIES.map(([cat, label]) => {
            const list = partners.filter((o) => o.Category === cat);
            if (!list.length) return null;
            return (
              <article key={cat} className="cat">
                <header>
                  <i>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      {CAT_ICONS[cat]}
                    </svg>
                  </i>
                  <h3>{t(label)}</h3>
                  <b>{list.length}</b>
                </header>
                <ul>
                  {list.map((o) => (
                    <li key={o.ID}>
                      <OrgLogo org={o} />
                      {n(o)}
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export const TermsPage = () => (
  <section className="partners page-text">
    <div className="wrap">
      <h2 className="sec-title">{up(t('საიტის წესები'))}</h2>
      <div className="page-body">
        <h3>{t('1. ზოგადი დებულებები')}</h3>
        <p>{t('loans.ge არის საინფორმაციო პლატფორმა, რომელიც მომხმარებელს ეხმარება სესხის შეთავაზებების შედარებასა და განაცხადის ერთდროულად რამდენიმე ორგანიზაციაში გაგზავნაში. საიტი თავად სესხს არ გასცემს.')}</p>
        <h3>{t('2. განაცხადის გაგზავნა')}</h3>
        <p>{t('განაცხადის შევსებით მომხმარებელი ადასტურებს, რომ მითითებული მონაცემები ზუსტია და თანახმაა, ისინი გადაეცეს მის მიერ არჩეულ პარტნიორ ორგანიზაციებს.')}</p>
        <h3>{t('3. პერსონალური მონაცემები')}</h3>
        <p>{t('მონაცემები მუშავდება მხოლოდ სესხის შეთავაზების მომზადების მიზნით და ინახება კანონმდებლობით დადგენილი წესით. მომხმარებელს ნებისმიერ დროს შეუძლია მონაცემების წაშლის მოთხოვნა.')}</p>
        <h3>{t('4. პასუხისმგებლობა')}</h3>
        <p>{t('სესხის საბოლოო პირობებს განსაზღვრავს გამცემი ორგანიზაცია. loans.ge არ არის პასუხისმგებელი პარტნიორის გადაწყვეტილებაზე ან შეთავაზების პირობების ცვლილებაზე.')}</p>
      </div>
    </div>
  </section>
);

export const AboutPage = () => (
  <section className="partners page-text">
    <div className="wrap">
      <h2 className="sec-title">{up(t('ჩვენს შესახებ'))}</h2>
      <div className="page-body">
        <p>{t('loans.ge არის სესხების შედარების პლატფორმა, სადაც ერთი განაცხადით რამდენიმე ბანკიდან, მიკროსაფინანსო და სალიზინგო ორგანიზაციიდან იღებ შეთავაზებებს და ირჩევ საუკეთესოს.')}</p>
        <h3>{t('როგორ ვმუშაობთ')}</h3>
        <p>{t('შენ ავსებ ერთ განაცხადს, ჩვენ ვუგზავნით მას შენ მიერ არჩეულ ორგანიზაციებს, ისინი კი კაბინეტში გიგზავნიან კონკრეტულ შეთავაზებებს — თანხით, ვადით და პროცენტით. შედარება და არჩევა შენზეა.')}</p>
        <h3>{t('რატომ loans.ge')}</h3>
        <p>{t('უფასოა მომხმარებლისთვის, ზოგავს დროს და გაძლევს რეალურ არჩევანს — შეთავაზებები ერთ ადგილას, გამჭვირვალე პირობებით.')}</p>
        <h3>{t('კონტაქტი')}</h3>
        <p>
          <b>+995 599 919 444</b> · <b>info@loans.ge</b>
        </p>
      </div>
    </div>
  </section>
);
