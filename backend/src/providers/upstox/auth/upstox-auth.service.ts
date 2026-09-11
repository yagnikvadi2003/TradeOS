import { z } from 'zod';
import { ProviderUnavailableError } from '@/common/errors/domain-error';
import { type ProviderCredentialStore } from './credential.store';

export interface UpstoxOAuthConfig {
  readonly apiBaseUrl: string;
  readonly clientId?: string | undefined;
  readonly clientSecret?: string | undefined;
  readonly redirectUri?: string | undefined;
  /** Static token from the environment (long-lived or daily); wins over the store. */
  readonly staticAccessToken?: string | undefined;
}

const tokenResponseSchema = z.object({
  access_token: z.string().min(16),
  /** Upstox tokens expire at 03:30 IST the next day; the API does not return expires_in. */
  expires_in: z.number().optional(),
});

/**
 * Upstox OAuth 2.0 (authorization-code). Verified flow:
 *   1. Browser → `GET {api}/v2/login/authorization/dialog?response_type=code&client_id&redirect_uri&state`
 *   2. Upstox redirects to `redirect_uri?code=…`
 *   3. Server → `POST {api}/v2/login/authorization/token` (form-urlencoded:
 *      code, client_id, client_secret, redirect_uri, grant_type=authorization_code)
 *      → `{ access_token, … }`
 * The client secret is used here and nowhere else; the token is encrypted at rest.
 */
export class UpstoxAuthService {
  constructor(
    private readonly config: UpstoxOAuthConfig,
    private readonly store: ProviderCredentialStore,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly now: () => number = () => Date.now(),
  ) {}

  get isConfigured(): boolean {
    return Boolean(this.config.clientId && this.config.clientSecret && this.config.redirectUri);
  }

  buildAuthorizationUrl(state: string): string {
    if (!this.isConfigured) throw new Error('Upstox OAuth is not configured');
    const url = new URL('/v2/login/authorization/dialog', this.config.apiBaseUrl);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', this.config.clientId!);
    url.searchParams.set('redirect_uri', this.config.redirectUri!);
    url.searchParams.set('state', state);
    return url.toString();
  }

  async exchangeAuthorizationCode(code: string): Promise<{ expiresAt: number }> {
    if (!this.isConfigured) throw new Error('Upstox OAuth is not configured');
    const body = new URLSearchParams({
      code,
      client_id: this.config.clientId!,
      client_secret: this.config.clientSecret!,
      redirect_uri: this.config.redirectUri!,
      grant_type: 'authorization_code',
    });
    const response = await this.fetchImpl(
      `${this.config.apiBaseUrl}/v2/login/authorization/token`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      },
    );
    if (!response.ok) {
      throw new ProviderUnavailableError(
        'upstox',
        new Error(`token exchange HTTP ${response.status}`),
      );
    }
    const parsed = tokenResponseSchema.safeParse(await response.json());
    if (!parsed.success)
      throw new ProviderUnavailableError('upstox', new Error('token response invalid'));
    const expiresAt = nextIstExpiry(this.now());
    await this.store.set('upstox', parsed.data.access_token, expiresAt);
    return { expiresAt };
  }

  /** Current usable token, or undefined when none/expired. Never logged. */
  async getAccessToken(): Promise<string | undefined> {
    if (this.config.staticAccessToken) return this.config.staticAccessToken;
    const stored = await this.store.get('upstox');
    if (!stored) return undefined;
    if (stored.expiresAt !== null && stored.expiresAt <= this.now()) return undefined;
    return stored.accessToken;
  }

  async status(): Promise<{ configured: boolean; hasToken: boolean; expiresAt: number | null }> {
    if (this.config.staticAccessToken) return { configured: true, hasToken: true, expiresAt: null };
    const stored = await this.store.get('upstox');
    const valid = Boolean(stored && (stored.expiresAt === null || stored.expiresAt > this.now()));
    return { configured: this.isConfigured, hasToken: valid, expiresAt: stored?.expiresAt ?? null };
  }
}

/** Upstox access tokens are valid until 03:30 IST of the following day. */
export function nextIstExpiry(nowMs: number): number {
  const IST = 5.5 * 3_600_000;
  const ist = new Date(nowMs + IST);
  const day = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate());
  const cutoff = day + 3.5 * 3_600_000 - IST; // 03:30 IST today, as UTC epoch
  return cutoff > nowMs ? cutoff : cutoff + 86_400_000;
}
