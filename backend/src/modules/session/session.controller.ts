import { Controller, Delete, Get, Header, Req, Res, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { type Request, type Response } from 'express';
import { z } from 'zod';
import { ApiStandardErrors, ApiZodResponse } from '@/common/openapi/zod-openapi';
import { type SessionRecord } from '@/modules/user-data/user-data.types';
import { CurrentSession, SessionGuard } from './session.guard';
import { SessionService } from './session.service';

const sessionSchema = z.object({
  data: z.object({
    id: z.string().uuid(),
    createdAt: z.number().int(),
    expiresAt: z.number().int(),
  }),
});

@ApiTags('session')
@Controller({ path: 'session', version: '1' })
export class SessionController {
  constructor(private readonly sessions: SessionService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Resolve or create the device session (sets the HttpOnly cookie)',
    description:
      'Anonymous, device-scoped, 30-day sliding session that owns watchlists, alerts and preferences. Mutating requests under /watchlists, /alerts, /notifications and /preferences must send `X-Requested-With: TradeOS`.',
  })
  @ApiZodResponse({ status: 200, description: 'Session', schema: sessionSchema })
  async get(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<z.infer<typeof sessionSchema>> {
    const s = await this.sessions.ensure(req, res);
    return { data: { id: s.id, createdAt: s.createdAt, expiresAt: s.expiresAt } };
  }

  @Delete()
  @UseGuards(SessionGuard)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Revoke the session and clear the cookie' })
  @ApiZodResponse({
    status: 200,
    description: 'Revoked',
    schema: z.object({ data: z.object({ revoked: z.literal(true) }) }),
  })
  @ApiStandardErrors(401)
  async revoke(
    @CurrentSession() session: SessionRecord,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.sessions.revoke(session, res);
    return { data: { revoked: true as const } };
  }
}
