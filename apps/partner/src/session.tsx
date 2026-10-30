import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, ReactNode, useContext, useEffect } from 'react';
import { api, ApiError, findAll, setUnauthorizedHandler } from './api';

// Partner session: who is logged in, which organisation (staff profile) and role.

export interface Profile {
  ID: number;
  UID: string;
  Role: 'sales' | 'back';
  DisplayName: string | null;
  Organization: { ID: number; UID: string; NameKa: string; NameEn: string; Color: string | null; LogoPath: string | null };
  /** cities a sales manager is limited to; empty = all */
  ScopeCities?: number[];
}
export interface Me {
  User: { ID: number; UID: string; Email: string | null; Phone: string | null };
  Profile: Profile | null;
  Profiles: Profile[];
}

export const ROLES = { sales: 'გაყიდვების მენეჯერი', back: 'ბექ-ოფისი' } as const;

interface State {
  me: Me | null;
  loading: boolean;
  refresh: () => Promise<unknown>;
  logout: () => Promise<void>;
  switchTo: (p: Profile) => Promise<void>;
}
const Ctx = createContext<State | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return await api<Me>('GET', '/partner/auth/me');
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: Infinity,
    retry: false,
  });
  useEffect(() => {
    setUnauthorizedHandler(() => qc.setQueryData(['me'], null));
  }, [qc]);
  const state: State = {
    me: q.data ?? null,
    loading: q.isLoading,
    refresh: () => q.refetch(),
    logout: async () => {
      await api('PUT', '/partner/auth/logout').catch(() => undefined);
      qc.setQueryData(['me'], null);
      // keep the session query (the header observes it); drop everything else
      qc.removeQueries({ predicate: (x) => x.queryKey[0] !== 'me' });
    },
    switchTo: async (p) => {
      await api('PUT', `/partner/auth/switchProfile/${p.ID}/${p.UID}`);
      qc.removeQueries({ predicate: (x) => x.queryKey[0] !== 'me' });
      await q.refetch();
    },
  };
  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

export const useSession = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('SessionProvider missing');
  return c;
};

// ── reference data (public gateway), cached

export interface StatusRow {
  Key: string;
  PartnerLabel: string;
  ChipLabel: string;
  Category: 'progress' | 'complete' | 'canceled';
  Color: string | null;
  TtlMinutes: number | null;
  Sort: number;
}
export interface Named {
  ID: number;
  UID: string;
  Code: string;
  NameKa: string;
  NameEn: string;
  Sort: number;
}
export interface City extends Named {
  RegionID: number;
}
export interface District extends Named {
  CityID: number;
}
export interface Currency {
  ID: number;
  Code: string;
  Symbol: string;
}
export interface ProductType extends Named {
  NoTerm: boolean;
}
export interface Field {
  ID: number;
  ProductTypeID: number;
  Key: string;
  LabelKa: string;
  Kind: 'number' | 'money' | 'int' | 'select' | 'bool' | 'pctMin';
  /** pctMin: { Pct, Min } — 2% (min. 10 ₾) */
  DefaultValue: number | string | boolean | { Pct: number; Min: number | null } | null;
  Step: number | null;
  Options: string[] | null;
  Sort: number;
}

const usePublic = <T,>(module: string, body: object = {}) =>
  useQuery<T[]>({ queryKey: ['public', module, body], queryFn: () => findAll<T>('public', module, body), staleTime: 5 * 60_000 }).data ?? [];

export function useRefs() {
  const statuses = usePublic<StatusRow>('status');
  const cities = usePublic<City>('city');
  const districts = usePublic<District>('district');
  const currencies = usePublic<Currency>('currency');
  const productTypes = usePublic<ProductType>('productType');
  const fields = usePublic<Field>('productTypeField', { Sort: [{ Field: 'Sort', Dir: 'asc' }] });
  const offerTypes = usePublic<Named>('offerType');
  const rejectReasons = usePublic<Named>('rejectReason');
  const cancelReasons = usePublic<Named>('cancelReason');
  return { statuses, cities, districts, currencies, productTypes, fields, offerTypes, rejectReasons, cancelReasons };
}

/** Status colours of the prototype (CSS variables); a colour set in the admin console wins. */
const ST_COLOR: Record<string, string> = {
  sent: 'var(--orange)', interested: 'var(--amber)', offer: 'var(--sky)', accepted: 'var(--blue)', done: 'var(--green)',
  rejected: 'var(--grey-status)', cancelled: 'var(--grey-status)', withdrawn: 'var(--grey-status)', declined: 'var(--grey-status)', expired: 'var(--grey-status)',
};
export const statusColor = (s: StatusRow | undefined, key: string) => s?.Color || ST_COLOR[key] || 'var(--grey-status)';
