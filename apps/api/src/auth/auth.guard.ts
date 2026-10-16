import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { parsePath } from '../core/action-log';
import { AppError } from '../core/errors';
import { currentContext } from '../core/request-context';
import { AuthedRequest, AuthGateway, isAuthGateway, sessionCookie } from './auth.types';
import { SessionService } from './session.service';

/** Read-only actions every admin role may call. */
const READ_ACTIONS = new Set(['find', 'detail', 'summary']);
/** Modules an operator may change (super may change everything, analyst nothing). */
const OPERATOR_WRITE = new Set(['organization', 'organizationProductType', 'staff', 'customer', 'user']);

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
  constructor(private readonly sessions: SessionService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const { gateway, module, action } = parsePath(req.originalUrl);
    if (!isAuthGateway(gateway)) return true;

    const bearer = req.header('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
    const token = bearer ?? cookieValue(req.headers.cookie, sessionCookie(gateway));
    if (!token) throw new AppError('UNAUTHORIZED', 'საჭიროა ავტორიზაცია');
    const auth = await this.sessions.resolve(gateway as AuthGateway, token);
    if (!auth) throw new AppError('UNAUTHORIZED', 'სესია არ არის ან ვადა გაუვიდა — შედი თავიდან');

    req.auth = auth;
    const rc = currentContext();
    if (rc) Object.assign(rc, { userId: auth.userId, userProfileId: auth.userProfileId, actorType: 'user' });

    if (gateway === 'admin' && module !== 'auth') this.checkAdminRole(auth.role, module, action);
    return true;
  }

  private checkAdminRole(role: string | null, module: string | null, action: string | null) {
    if (role === 'super') return;
    if (action && READ_ACTIONS.has(action)) return;
    if (role === 'operator' && module && OPERATOR_WRITE.has(module)) return;
    throw new AppError('FORBIDDEN', 'ამ მოქმედების უფლება არ გაქვს');
  }
}
