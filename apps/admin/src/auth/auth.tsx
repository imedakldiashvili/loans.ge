import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, ReactNode, useContext, useEffect } from 'react';
import { api, ApiError, setUnauthorizedHandler } from '../api/client';

export interface Me {
  User: { ID: number; UID: string; Email: string | null; Phone: string | null; UserName: string | null };
  Profile: { ID: number; UID: string; ProfileType: string; Role: 'super' | 'operator' | 'analyst'; DisplayName: string | null } | null;
  Profiles: Me['Profile'][];
}

export const ADMIN_ROLES = { super: 'სუპერადმინი', operator: 'ოპერატორი', analyst: 'ანალიტიკოსი' } as const;

interface AuthState {
  me: Me | null;
  loading: boolean;
  refresh: () => Promise<unknown>;
  logout: () => Promise<void>;
  /** What the current role may change — mirrors the API rules (AuthGuard). */
  canWrite: (module: string) => boolean;
}

const Ctx = createContext<AuthState | null>(null);
const OPERATOR_WRITE = new Set(['organization', 'organizationProductType', 'staff', 'customer', 'user']);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return await api<Me>('GET', '/admin/auth/me');
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: Infinity,
    retry: false,
  });

  useEffect(() => {
    // a 401 anywhere means the session is gone — back to the login form
    setUnauthorizedHandler(() => qc.setQueryData(['me'], null));
  }, [qc]);

  const me = q.data ?? null;
  const role = me?.Profile?.Role;
  const state: AuthState = {
    me,
    loading: q.isLoading,
    refresh: () => q.refetch(),
    logout: async () => {
      await api('PUT', '/admin/auth/logout').catch(() => undefined);
      qc.clear();
      qc.setQueryData(['me'], null);
    },
    canWrite: (module) => role === 'super' || (role === 'operator' && OPERATOR_WRITE.has(module)),
  };
  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

export const useAuth = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('AuthProvider missing');
  return c;
};
