import { AsyncLocalStorage } from 'async_hooks';

/** Per-request data available anywhere in the call chain (STANDARDS.md §4). */
export interface RequestContext {
  /** Request UID — returned in `X-Request-Uid`, key of the action log. */
  uid: string;
  startedOn: Date;
  gateway: string | null;
  module: string | null;
  action: string | null;
  /** user.id of the caller; null for anonymous calls (filled by auth in stage 2). */
  userId: bigint | null;
  userProfileId: bigint | null;
  actorType: 'user' | 'integration' | 'system' | null;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

export const currentContext = (): RequestContext | undefined => requestContext.getStore();

/** Who is acting — goes to CreatedBy / UpdatedBy / DeletedBy. */
export const currentUserId = (): bigint | null => currentContext()?.userId ?? null;
