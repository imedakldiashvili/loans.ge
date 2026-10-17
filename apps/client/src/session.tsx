import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, ReactNode, useContext, useEffect } from 'react';
import { api, ApiError, findAll, setUnauthorizedHandler } from './api';

// Customer session (client gateway) and the reference data the site needs (public gateway).

export interface Me {
  User: { ID: number; UID: string; Email: string | null; Phone: string | null; UserName: string | null; IsVerified: boolean };
  Profile: { ID: number; UID: string; ProfileType: string } | null;
}

interface State {
  me: Me | null;
  loading: boolean;
  refresh: () => Promise<Me | null>;
  logout: () => Promise<void>;
}
const Ctx = createContext<State | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return await api<Me>('GET', '/client/auth/me');
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
    refresh: async () => (await q.refetch()).data ?? null,
    logout: async () => {
      await api('PUT', '/client/auth/logout').catch(() => undefined);
      qc.setQueryData(['me'], null);
      // drop the customer's data; keep the session query (the header observes it) and the reference data
      qc.removeQueries({ predicate: (x) => !['public', 'me'].includes(String(x.queryKey[0])) });
    },
  };
  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

export const useSession = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('SessionProvider missing');
  return c;
};

// ── reference data

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
  MinAmount: number;
  MaxAmount: number;
  AmountRanges: number[];
  NoTerm: boolean;
}
export interface Org {
  ID: number;
  UID: string;
  NameKa: string;
  Category: 'bank' | 'mfo' | 'leasing' | 'lender';
  Color: string | null;
  LogoPath: string | null;
  IsPartner: boolean;
  Sort: number;
  ProductTypes: { ProductTypeID: number }[];
}
export interface StatusRow {
  Key: string;
  CustomerKa: string;
  CustomerEn: string;
  Category: 'progress' | 'complete' | 'canceled';
  Sort: number;
}

const usePublic = <T,>(module: string) =>
  useQuery<T[]>({ queryKey: ['public', module], queryFn: () => findAll<T>('public', module), staleTime: 5 * 60_000 }).data ?? [];

export function useRefs() {
  return {
    productTypes: usePublic<ProductType>('productType'),
    currencies: usePublic<Currency>('currency'),
    cities: usePublic<City>('city'),
    districts: usePublic<District>('district'),
    sectors: usePublic<Named>('sector'),
    incomeSources: usePublic<Named>('incomeSource'),
    creditHistory: usePublic<Named>('creditHistory'),
    organizations: usePublic<Org>('organization'),
    statuses: usePublic<StatusRow>('status'),
  };
}

export const CATEGORIES: [Org['Category'], string][] = [
  ['bank', 'ბანკები'],
  ['mfo', 'მიკროსაფინანსო'],
  ['leasing', 'ლიზინგი'],
  ['lender', 'სესხის გამცემი სუბიექტი'],
];
const ORG_COLORS = ['#1e63b5', '#7b4fb5', '#0f9d8a', '#c0392b', '#b8860b', '#2e7d32'];
export const orgColor = (o: { ID: number; Color?: string | null }) => o.Color || ORG_COLORS[o.ID % ORG_COLORS.length];
/** Short logo text: a short last word as it is ("ბანკი A" → "A"), otherwise the first letters ("საქართველოს ბანკი" → "სბ"). */
export const orgMark = (name: string) => {
  const w = name.trim().split(/\s+/).filter(Boolean);
  const last = w.at(-1) ?? '';
  return last.length <= 2 ? last : w.slice(0, 2).map((x) => x[0]).join('');
};

/** Without its own logo an organisation shows the loans.ge logo (kept at /fs/default/…). */
export const DEFAULT_ORG_LOGO = '/fs/default/org-logo.png';

/** Organisation logo (uploaded in admin, served at /fs/…); without one — the loans.ge logo. */
export function OrgLogo({ org }: { org: { ID: number; NameKa: string; Color?: string | null; LogoPath?: string | null } }) {
  return (
    <span className={`lg img${org.LogoPath ? '' : ' tmp'}`} title={org.LogoPath ? undefined : 'loans.ge'}>
      <img src={org.LogoPath ? `/fs/${org.LogoPath}` : DEFAULT_ORG_LOGO} alt="" />
    </span>
  );
}
