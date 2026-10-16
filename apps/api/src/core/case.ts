// Key conversion between the database/code (camelCase) and the API (PascalCase) — STANDARDS.md §6.
import { Prisma } from '@prisma/client';

// `id` / `uid` and their suffixes are written as `ID` / `UID` (e.g. cityId → CityID).

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && !(v instanceof Date) && Object.getPrototypeOf(v) === Object.prototype;

export const pascalKey = (k: string): string => {
  if (k === 'id') return 'ID';
  if (k === 'uid') return 'UID';
  const p = k.charAt(0).toUpperCase() + k.slice(1);
  return p.replace(/Uid$/, 'UID').replace(/Id$/, 'ID').replace(/Ids$/, 'IDs');
};

export const camelKey = (k: string): string => {
  if (k === 'ID') return 'id';
  if (k === 'UID') return 'uid';
  const c = k.replace(/UID$/, 'Uid').replace(/IDs$/, 'Ids').replace(/ID$/, 'Id');
  return c.charAt(0).toLowerCase() + c.slice(1);
};

/** Output: PascalCase keys, BigInt → number, Decimal → number. */
export const toApi = (v: unknown): unknown => {
  if (typeof v === 'bigint') return Number(v);
  if (Array.isArray(v)) return v.map(toApi);
  if (Prisma.Decimal.isDecimal(v)) return (v as Prisma.Decimal).toNumber();
  if (isPlainObject(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [pascalKey(k), toApi(x)]));
  return v;
};

/** Input: PascalCase keys → camelCase (values untouched). */
export const fromApi = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(fromApi);
  if (isPlainObject(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [camelKey(k), fromApi(x)]));
  return v;
};
