import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import EN from './en.json';

// Georgian / English (prototype loans-ge.html: the ქარ | EN switch).
// Texts are written in Georgian and translated with the prototype's dictionary (en.json);
// reference data comes from the API in both languages (NameKa / NameEn, CustomerKa / CustomerEn).

export type Lang = 'ka' | 'en';
const DICT = EN as Record<string, string>;
const RX: [RegExp, string][] = [
  [/^(\d+) თვე$/, '$1 months'],
  [/^ბანკი (\S+)$/, 'Bank $1'],
  [/^მისო (\S+)$/, 'MFO $1'],
  [/^ლიზინგი (\S+)$/, 'Leasing $1'],
  [/^სუბიექტი (\S+)$/, 'Entity $1'],
];

let current: Lang = (() => {
  try {
    return localStorage.getItem('lang') === 'en' ? 'en' : 'ka';
  } catch {
    return 'ka';
  }
})();

/** Translate a Georgian text (unknown texts stay Georgian). */
export const t = (ka: string): string => {
  if (current === 'ka' || !ka) return ka;
  const k = ka.trim();
  let hit = DICT[k];
  if (!hit) {
    const r = RX.find(([rx]) => rx.test(k));
    if (r) hit = k.replace(r[0], r[1]);
  }
  return hit ? ka.replace(k, hit) : ka;
};
/** Name of a reference row in the current language. */
export const n = (x: { NameKa: string; NameEn?: string | null } | null | undefined) => (x ? (current === 'en' && x.NameEn) || x.NameKa : '');
export const lang = () => current;

const Ctx = createContext<{ lang: Lang; toggle: () => void }>({ lang: current, toggle: () => {} });
export const useLang = () => useContext(Ctx);

export function LangProvider({ children }: { children: ReactNode }) {
  const [value, setValue] = useState<Lang>(current);
  useEffect(() => {
    current = value;
    document.documentElement.setAttribute('lang', value);
    try {
      localStorage.setItem('lang', value);
    } catch {
      /* storage blocked */
    }
  }, [value]);
  const toggle = () => {
    const next = current === 'en' ? 'ka' : 'en';
    current = next; // texts read `current` during the re-render that follows
    setValue(next);
  };
  return <Ctx.Provider value={{ lang: value, toggle }}>{children}</Ctx.Provider>;
}

/** A value stored as its Georgian name (credit history, sector, income source, bank) shown in the current language. */
export const refName = (list: { NameKa: string; NameEn?: string | null }[], ka: string | null | undefined) => (ka ? n(list.find((x) => x.NameKa === ka)) || ka : '');

/** Capitals for headings styled `text-transform: uppercase`: browsers don't apply it to Georgian, so mkhedruli → mtavruli here. */
export const up = (s: string) => s.toUpperCase();
