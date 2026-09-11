import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Minimal HS256 JWT for realtime session tokens. Deliberately tiny: sign,
 * verify signature + exp + audience. The users/auth module will issue these
 * from real sessions; until then `RealtimeTokenController` mints anonymous
 * short-lived sessions. No third-party JWT library is needed for this.
 */
export interface RealtimeClaims {
  readonly sub: string;
  readonly aud: 'tradeos:ws';
  readonly iat: number;
  readonly exp: number;
  /** Stream keys the session may subscribe to; `*` = any catalog instrument. */
  readonly scope: readonly string[];
}

const HEADER = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');

export class RealtimeTokenService {
  constructor(
    private readonly secret: string,
    private readonly now: () => number = () => Date.now(),
  ) {
    if (secret.length < 32) throw new Error('realtime token secret must be at least 32 characters');
  }

  static generateSecret(): string {
    return randomBytes(48).toString('base64url');
  }

  issue(
    sub: string,
    ttlSeconds: number,
    scope: readonly string[] = ['*'],
  ): { token: string; claims: RealtimeClaims } {
    const iat = Math.floor(this.now() / 1000);
    const claims: RealtimeClaims = { sub, aud: 'tradeos:ws', iat, exp: iat + ttlSeconds, scope };
    const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
    const signature = this.sign(`${HEADER}.${payload}`);
    return { token: `${HEADER}.${payload}.${signature}`, claims };
  }

  /** Returns the claims or null. Never throws on malformed input. */
  verify(token: string): RealtimeClaims | null {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, payload, signature] = parts as [string, string, string];
    if (header !== HEADER) return null;
    const expected = Buffer.from(this.sign(`${header}.${payload}`));
    const given = Buffer.from(signature);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
    let claims: unknown;
    try {
      claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    } catch {
      return null;
    }
    if (!isClaims(claims)) return null;
    if (claims.aud !== 'tradeos:ws') return null;
    if (claims.exp * 1000 <= this.now()) return null;
    return claims;
  }

  private sign(input: string): string {
    return createHmac('sha256', this.secret).update(input).digest('base64url');
  }
}

function isClaims(value: unknown): value is RealtimeClaims {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.sub === 'string' &&
    typeof v.exp === 'number' &&
    typeof v.iat === 'number' &&
    Array.isArray(v.scope) &&
    v.scope.every((s) => typeof s === 'string')
  );
}

export const REALTIME_TOKEN_SERVICE = Symbol('REALTIME_TOKEN_SERVICE');
