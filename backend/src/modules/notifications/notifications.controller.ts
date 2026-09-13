import { Body, Controller, Get, Header, Inject, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  ApiStandardErrors,
  ApiZodBody,
  ApiZodQuery,
  ApiZodResponse,
} from '@/common/openapi/zod-openapi';
import { ZodValidationPipe } from '@/common/validation/zod-validation.pipe';
import { CurrentSession, SessionGuard } from '@/modules/session/session.guard';
import {
  type SessionRecord,
  USER_DATA_REPOSITORY,
  type UserDataRepository,
} from '@/modules/user-data/user-data.types';

const listQuery = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) });
const readBody = z.object({
  ids: z.union([z.literal('all'), z.array(z.string().uuid()).min(1).max(200)]),
});
const notificationSchema = z.object({
  id: z.string().uuid(),
  alertId: z.string().uuid().nullable(),
  title: z.string(),
  body: z.string(),
  value: z
    .number()
    .nullable()
    .describe('Observed value that satisfied the alert (TradeOS-derived)'),
  readAt: z.number().nullable(),
  createdAt: z.number(),
});

/** In-app notification inbox. New ones also arrive live over /ws/market as `notification` frames. */
@ApiTags('notifications')
@Controller({ path: 'notifications', version: '1' })
@UseGuards(SessionGuard)
export class NotificationsController {
  constructor(@Inject(USER_DATA_REPOSITORY) private readonly repo: UserDataRepository) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Recent notifications (newest first, max 200 kept per session)' })
  @ApiZodQuery(listQuery)
  @ApiZodResponse({
    status: 200,
    description: 'Notifications',
    schema: z.object({ data: z.array(notificationSchema) }),
  })
  @ApiStandardErrors(400, 401)
  async list(
    @CurrentSession() s: SessionRecord,
    @Query(new ZodValidationPipe(listQuery)) q: z.infer<typeof listQuery>,
  ) {
    return { data: await this.repo.listNotifications(s.id, q.limit) };
  }

  @Post('read')
  @ApiOperation({ summary: 'Mark notifications read (ids or "all")' })
  @ApiZodBody(readBody)
  @ApiZodResponse({
    status: 200,
    description: 'Count marked',
    schema: z.object({ data: z.object({ marked: z.number().int() }) }),
  })
  @ApiStandardErrors(400, 401)
  async read(
    @CurrentSession() s: SessionRecord,
    @Body(new ZodValidationPipe(readBody)) body: z.infer<typeof readBody>,
  ) {
    return { data: { marked: await this.repo.markNotificationsRead(s.id, body.ids) } };
  }
}
