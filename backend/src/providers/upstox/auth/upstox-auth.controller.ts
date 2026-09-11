import { randomBytes } from 'node:crypto';
import {
  Controller,
  Get,
  Header,
  Inject,
  Query,
  UnauthorizedException,
  Headers as ReqHeaders,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ApiStandardErrors, ApiZodResponse } from '@/common/openapi/zod-openapi';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { APP_ENV, type AppEnv } from '@/common/config/env';
import { ZodValidationPipe } from '@/common/validation/zod-validation.pipe';
import { UpstoxAuthService } from './upstox-auth.service';

const callbackSchema = z.object({
  code: z.string().min(4).max(512),
  state: z.string().min(8).max(128),
});
const STATE_TTL_MS = 10 * 60 * 1000;
const MAX_PENDING_STATES = 20;

/**
 * Operator-only endpoints for the Upstox OAuth flow. Protected by
 * `X-Operator-Key`; in development without a key they are open on
 * localhost only because the server binds there. Tokens are never returned.
 */
@ApiTags('operator')
@ApiSecurity('operator-key')
@Controller({ path: 'providers/upstox/auth', version: '1' })
export class UpstoxAuthController {
  /** Outstanding OAuth `state` values: single-use, short-lived, bounded. */
  private readonly pendingStates = new Map<string, number>();

  constructor(
    private readonly auth: UpstoxAuthService,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {}

  private issueState(): string {
    const now = Date.now();
    for (const [state, issuedAt] of this.pendingStates) {
      if (now - issuedAt > STATE_TTL_MS) this.pendingStates.delete(state);
    }
    if (this.pendingStates.size >= MAX_PENDING_STATES) {
      const oldest = this.pendingStates.keys().next().value;
      if (oldest !== undefined) this.pendingStates.delete(oldest);
    }
    const state = randomBytes(18).toString('base64url');
    this.pendingStates.set(state, now);
    return state;
  }

  private consumeState(state: string): boolean {
    const issuedAt = this.pendingStates.get(state);
    this.pendingStates.delete(state);
    return issuedAt !== undefined && Date.now() - issuedAt <= STATE_TTL_MS;
  }

  private guard(key: string | undefined): void {
    if (!this.env.OPERATOR_API_KEY) {
      if (this.env.NODE_ENV === 'production') throw new UnauthorizedException();
      return;
    }
    if (key !== this.env.OPERATOR_API_KEY) throw new UnauthorizedException();
  }

  @Get('status')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Provider credential status (never the token itself)' })
  @ApiZodResponse({
    status: 200,
    description: 'Whether OAuth is configured and a valid token is stored',
    schema: z.object({
      data: z.object({
        configured: z.boolean(),
        hasToken: z.boolean(),
        expiresAt: z.number().nullable(),
      }),
    }),
  })
  @ApiStandardErrors(401, 429)
  async status(@ReqHeaders('x-operator-key') key?: string) {
    this.guard(key);
    return { data: await this.auth.status() };
  }

  @Get('url')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Upstox OAuth login URL with a single-use state',
    description:
      'Open the returned URL in a browser; Upstox redirects to /callback with `code` and this `state` (valid 10 minutes, single use).',
  })
  @ApiZodResponse({
    status: 200,
    description: 'Login URL and state',
    schema: z.object({ data: z.object({ url: z.string().url(), state: z.string() }) }),
  })
  @ApiStandardErrors(401, 429)
  url(@ReqHeaders('x-operator-key') key?: string) {
    this.guard(key);
    const state = this.issueState();
    return { data: { url: this.auth.buildAuthorizationUrl(state), state } };
  }

  @Get('callback')
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: 'OAuth redirect target: exchanges the code and stores the token encrypted',
    description:
      'Authorized by the `state` minted by /url, not by the operator key (browsers cannot add headers on redirects).',
  })
  @ApiQuery({
    name: 'code',
    required: true,
    description: 'Single-use authorization code from Upstox',
  })
  @ApiQuery({ name: 'state', required: true, description: 'State returned by /url' })
  @ApiZodResponse({
    status: 200,
    description: 'Token stored; expiry at 03:30 IST next day',
    schema: z.object({ data: z.object({ stored: z.literal(true), expiresAt: z.number() }) }),
  })
  @ApiStandardErrors(400, 401, 429, 503)
  /**
   * The browser redirect from Upstox cannot carry the operator header, so the
   * callback is authorized by the single-use `state` minted by `/url` (which
   * *was* operator-guarded). A missing or replayed state is rejected.
   */
  async callback(
    @Query(new ZodValidationPipe(callbackSchema)) query: z.infer<typeof callbackSchema>,
  ) {
    if (!this.consumeState(query.state))
      throw new UnauthorizedException('unknown or expired state');
    const result = await this.auth.exchangeAuthorizationCode(query.code);
    return { data: { stored: true, expiresAt: result.expiresAt } };
  }
}
