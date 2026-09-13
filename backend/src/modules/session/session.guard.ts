import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { type Request, type Response } from 'express';
import { type SessionRecord } from '@/modules/user-data/user-data.types';
import { SessionService } from './session.service';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
export const CSRF_HEADER = 'x-requested-with';
export const CSRF_VALUE = 'TradeOS';

/**
 * Requires a valid session cookie (401 otherwise) and, on mutations, the
 * custom `X-Requested-With: TradeOS` header. A cross-site page cannot add
 * a custom header without a CORS preflight the strict CORS policy rejects,
 * which — together with SameSite=Lax — is the CSRF defence for cookie auth.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly sessions: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { session?: SessionRecord }>();
    const res = context.switchToHttp().getResponse<Response>();
    if (MUTATING.has(req.method) && req.headers[CSRF_HEADER] !== CSRF_VALUE) {
      throw new UnauthorizedException('missing X-Requested-With: TradeOS');
    }
    // Guarded routes never mint a session: the client must call GET /session first.
    const session = await this.sessions.resolve(req);
    if (!session) throw new UnauthorizedException('session required');
    await this.sessions.renewIfNeeded(session, res);
    req.session = session;
    return true;
  }
}

export const CurrentSession = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): SessionRecord => {
    const req = ctx.switchToHttp().getRequest<Request & { session?: SessionRecord }>();
    if (!req.session) throw new UnauthorizedException();
    return req.session;
  },
);
