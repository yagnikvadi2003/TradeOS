import { createHmac, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { type Request, type Response } from 'express';
import { APP_ENV, type AppEnv } from '@/common/config/env';
import { REALTIME_TOKEN_SERVICE, type RealtimeTokenService } from '@/common/realtime/realtime-auth';
import {
  type SessionRecord,
  USER_DATA_REPOSITORY,
  type UserDataRepository,
} from '@/modules/user-data/user-data.types';

export const SESSION_COOKIE = 'tradeos_sid';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const RENEW_BEFORE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Device-scoped durable session — the owner of watchlists, alerts and
 * preferences until accounts exist (ADR-0008). Transport: an HttpOnly,
 * SameSite=Lax cookie `tradeos_sid=<id>.<hmac>`; the id is a UUID stored
 * server-side, the HMAC (secret = REALTIME_JWT_SECRET) rejects forged ids
 * before any database lookup. Sliding 30-day expiry, renewed when a week
 * remains. Realtime tokens are issued with `sub = session id` so alert
 * notifications can be pushed to that session's sockets.
 */
@Injectable()
export class SessionService {
  private readonly secret: string;

  constructor(
    @Inject(USER_DATA_REPOSITORY) private readonly repo: UserDataRepository,
    @Inject(APP_ENV) private readonly env: AppEnv,
    @Inject(REALTIME_TOKEN_SERVICE) private readonly tokens: RealtimeTokenService,
  ) {
    this.secret = env.REALTIME_JWT_SECRET ?? tokens.secretForSessions;
  }

  private sign(id: string): string {
    return createHmac('sha256', this.secret).update(id).digest('base64url');
  }

  private parse(header: string | undefined): string | null {
    if (!header) return null;
    for (const part of header.split(';')) {
      const [k, v] = part.trim().split('=');
      if (k !== SESSION_COOKIE || !v) continue;
      const [id, mac] = decodeURIComponent(v).split('.');
      if (!id || !mac || !/^[0-9a-f-]{36}$/.test(id)) return null;
      const expected = Buffer.from(this.sign(id));
      const given = Buffer.from(mac);
      return expected.length === given.length && timingSafeEqual(expected, given) ? id : null;
    }
    return null;
  }

  /** Resolve the request's session without creating one. */
  async resolve(req: Request): Promise<SessionRecord | null> {
    const id = this.parse(req.headers.cookie);
    if (!id) return null;
    const session = await this.repo.getSession(id);
    if (session?.revokedAt !== null || session.expiresAt <= Date.now()) return null;
    return session;
  }

  /** Sliding expiry: renew the cookie and row when less than a week remains. */
  async renewIfNeeded(session: SessionRecord, res: Response): Promise<SessionRecord> {
    const now = Date.now();
    if (session.expiresAt - now >= RENEW_BEFORE_MS) return session;
    await this.repo.touchSession(session.id, now + SESSION_TTL_MS);
    this.setCookie(res, session.id, SESSION_TTL_MS);
    return { ...session, expiresAt: now + SESSION_TTL_MS };
  }

  /** Resolve or create; sets/renews the cookie. Only GET /session mints sessions. */
  async ensure(req: Request, res: Response): Promise<SessionRecord> {
    const existing = await this.resolve(req);
    const now = Date.now();
    if (existing) return this.renewIfNeeded(existing, res);
    const created = await this.repo.createSession(now + SESSION_TTL_MS);
    this.setCookie(res, created.id, SESSION_TTL_MS);
    return created;
  }

  async revoke(session: SessionRecord, res: Response): Promise<void> {
    await this.repo.revokeSession(session.id);
    this.setCookie(res, '', 0);
  }

  issueStreamToken(session: SessionRecord): { token: string; expiresAt: number } {
    const { token, claims } = this.tokens.issue(
      `session:${session.id}`,
      this.env.REALTIME_TOKEN_TTL_SECONDS,
    );
    return { token, expiresAt: claims.exp * 1000 };
  }

  private setCookie(res: Response, id: string, maxAgeMs: number): void {
    const value = id ? `${id}.${this.sign(id)}` : '';
    const attrs = [
      `${SESSION_COOKIE}=${encodeURIComponent(value)}`,
      'Path=/',
      'HttpOnly',
      'SameSite=Lax',
      `Max-Age=${Math.floor(maxAgeMs / 1000)}`,
      ...(this.env.NODE_ENV === 'production' ? ['Secure'] : []),
    ];
    res.append('Set-Cookie', attrs.join('; '));
  }
}
