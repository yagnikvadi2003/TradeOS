import { randomUUID } from 'node:crypto';
import { Controller, Get, Header, Inject, Req } from '@nestjs/common';
import { type Request } from 'express';
import { SessionService } from '@/modules/session/session.service';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ApiStandardErrors, ApiZodResponse } from '@/common/openapi/zod-openapi';
import { Throttle } from '@nestjs/throttler';
import { APP_ENV, type AppEnv } from '@/common/config/env';
import { REALTIME_TOKEN_SERVICE, type RealtimeTokenService } from '@/common/realtime/realtime-auth';
import { WS_PATH } from './market-stream.gateway';

/**
 * Mints a short-lived session token for `/ws/market`. Until the users
 * module exists every session is anonymous with catalog-wide scope; the
 * WebSocket still refuses any connection that does not present one, so the
 * auth-first contract is in place from day one and the issuer is the only
 * thing that changes later.
 */
@ApiTags('realtime')
@Controller({ path: 'realtime', version: '1' })
export class RealtimeTokenController {
  constructor(
    @Inject(REALTIME_TOKEN_SERVICE) private readonly tokens: RealtimeTokenService,
    @Inject(APP_ENV) private readonly env: AppEnv,
    private readonly sessions: SessionService,
  ) {}

  @Get('token')
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Issue a realtime session token for the market WebSocket',
    description:
      'Anonymous, catalog-wide, 15-minute HS256 token. Send it as the first frame on /ws/market (`{"type":"auth","token"}`). Rate limited to 10/min per client. Protocol: docs/websocket-protocol.md',
  })
  @ApiZodResponse({
    status: 200,
    description: 'Session token',
    schema: z.object({
      data: z.object({
        token: z.string().describe('Opaque to clients; never log or persist'),
        expiresAt: z.number().int().describe('Epoch ms'),
        path: z.string().describe('WebSocket path on this host'),
      }),
    }),
    example: { data: { token: 'eyJ…', expiresAt: 1789000000000, path: '/ws/market' } },
  })
  @ApiStandardErrors(429)
  async issue(
    @Req() req: Request,
  ): Promise<{ data: { token: string; expiresAt: number; path: string } }> {
    // Session-bound when the device cookie is present (enables alert push); anonymous otherwise.
    const session = await this.sessions.resolve(req);
    if (session) {
      const issued = this.sessions.issueStreamToken(session);
      return { data: { ...issued, path: WS_PATH } };
    }
    const { token, claims } = this.tokens.issue(
      `anon:${randomUUID()}`,
      this.env.REALTIME_TOKEN_TTL_SECONDS,
    );
    return { data: { token, expiresAt: claims.exp * 1000, path: WS_PATH } };
  }
}
