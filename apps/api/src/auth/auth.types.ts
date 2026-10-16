import type { Request } from 'express';

/** Gateways that need a signed-in user and the profile type each one requires. */
export const GATEWAY_PROFILE = { admin: 'admin', partner: 'staff', client: 'customer' } as const;
export type AuthGateway = keyof typeof GATEWAY_PROFILE;
export const isAuthGateway = (g: string | null | undefined): g is AuthGateway => !!g && g in GATEWAY_PROFILE;

/** Session lifetime per gateway. */
export const SESSION_HOURS: Record<AuthGateway, number> = { admin: 12, partner: 12, client: 24 * 30 };

/** Cookie holding the session token — one per gateway, so the three surfaces never share a session. */
export const sessionCookie = (g: AuthGateway) => `lg_${g}`;

export interface AuthInfo {
  /** null when the caller is a bank system with an API key */
  sessionId: bigint | null;
  userId: bigint | null;
  userProfileId: bigint | null;
  gateway: AuthGateway;
  /** admin: super | operator | analyst; staff: sales | back; customer: null */
  role: string | null;
  organizationId: bigint | null;
  /** staff sales scope — empty = everything */
  scopeCities: bigint[];
  scopeProducts: bigint[];
  /** API key calls (partner gateway, integration): the key and what it may do */
  apiKeyId?: bigint;
  scopes?: string[];
}

export type AuthedRequest = Request & { auth?: AuthInfo };

/** The signed-in user of a session (not an API key) — for auth/me, logout, switchProfile. */
export const userAuth = (req: AuthedRequest) => {
  const a = req.auth;
  if (!a?.sessionId || !a.userId || !a.userProfileId) throw new Error('user session required');
  return a as AuthInfo & { sessionId: bigint; userId: bigint; userProfileId: bigint };
};
