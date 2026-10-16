import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { parsePath } from '../core/action-log';
import { AppError } from '../core/errors';
import { currentContext } from '../core/request-context';
import { AuthedRequest, AuthGateway, isAuthGateway, sessionCookie } from './auth.types';
import { ApiKeyService } from '../integration/api-keys';
import { SessionService } from './session.service';

/** Read-only actions every admin role may call. */
const READ_ACTIONS = new Set(['find', 'detail', 'summary', 'stream']);
/** Modules an operator may change (super may change everything, analyst nothing). */
const OPERATOR_WRITE = new Set(['organization', 'organizationProductType', 'staff', 'customer', 'user']);
/** API key scopes → what they open on the partner gateway (module → read / write scope). */
const SCOPE_MODULES: Record<string, { read: string; write: string }> = {
  application: { read: 'applications:read', write: 'applications:write' },
  product: { read: 'catalog:read', write: 'catalog:write' },
  card: { read: 'catalog:read', write: 'catalog:write' },
};

const cookieValue = (header: string | undefined, name: string) => {
  for (const part of (header ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
};

/**
 * Global guard: `public` is open; `admin` / `partner` / `client` need a session of that gateway
 * (cookie `lg_{gateway}` or `Authorization: Bearer …`) with the matching profile type.
 * Fills the request context (CreatedBy, actionLog) and applies admin roles.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly sessions: SessionService,
    private readonly apiKeys: ApiKeyService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const { gateway, module, action } = parsePath(req.originalUrl);
    if (!isAuthGateway(gateway)) return true;

    // a bank's system: partner gateway with an API key instead of a session
    const apiKey = gateway === 'partner' ? req.header('x-api-key') : undefined;
    if (apiKey) {
      const auth = await this.apiKeys.resolve(apiKey);
      if (!auth) throw new AppError('UNAUTHORIZED', 'API გასაღები არასწორია, გამორთულია ან ვადა გაუვიდა');
      req.auth = auth;
      const rc = currentContext();
      if (rc) Object.assign(rc, { userId: null, userProfileId: null, actorType: 'integration', organizationId: auth.organizationId, role: 'integration', scopeCities: [], scopeProducts: [] });
      this.checkScopes(auth.scopes ?? [], module, action);
      return true;
    }

    const bearer = req.header('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
    const token = bearer ?? cookieValue(req.headers.cookie, sessionCookie(gateway));
    if (!token) throw new AppError('UNAUTHORIZED', 'საჭიროა ავტორიზაცია');
    const auth = await this.sessions.resolve(gateway as AuthGateway, token);
    if (!auth) throw new AppError('UNAUTHORIZED', 'სესია არ არის ან ვადა გაუვიდა — შედი თავიდან');

    req.auth = auth;
    const rc = currentContext();
    if (rc) Object.assign(rc, { userId: auth.userId, userProfileId: auth.userProfileId, actorType: 'user', organizationId: auth.organizationId, role: auth.role, scopeCities: auth.scopeCities, scopeProducts: auth.scopeProducts });

    if (gateway === 'admin' && module !== 'auth') this.checkAdminRole(auth.role, module, action);
    if (gateway === 'partner') this.checkPartnerRole(auth.role, module, action);
    return true;
  }

  /** API key: only applications and the catalogue, as far as its scopes go (no staff, keys, webhooks, auth, live stream). */
  private checkScopes(scopes: string[], module: string | null, action: string | null) {
    const m = module ? SCOPE_MODULES[module] : undefined;
    const need = m && action ? (READ_ACTIONS.has(action) ? m.read : m.write) : null;
    if (!need) throw new AppError('FORBIDDEN', 'API გასაღებით ეს მოქმედება მიუწვდომელია');
    if (!scopes.includes(need)) throw new AppError('FORBIDDEN', `API გასაღებს არ აქვს უფლება „${need}"`);
  }

  /** Back office manages products, offer cards and staff; sales may only read products / cards (to make offers). */
  private checkPartnerRole(role: string | null, module: string | null, action: string | null) {
    if (role === 'back' || ['auth', 'application', 'events', 'notification', 'push'].includes(module ?? '')) return;
    if ((module === 'product' || module === 'card') && action && READ_ACTIONS.has(action)) return;
    throw new AppError('FORBIDDEN', 'ამ მოქმედების უფლება არ გაქვს');
  }

  private checkAdminRole(role: string | null, module: string | null, action: string | null) {
    if (role === 'super') return;
    if (action && READ_ACTIONS.has(action)) return;
    if (role === 'operator' && module && OPERATOR_WRITE.has(module)) return;
    throw new AppError('FORBIDDEN', 'ამ მოქმედების უფლება არ გაქვს');
  }
}
