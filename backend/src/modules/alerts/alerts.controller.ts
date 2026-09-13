import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Inject,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { mapUserDataError, notFound } from '@/common/errors/user-data-errors';
import {
  INSTRUMENT_KEY_PATTERN,
  OPTION_CONTRACT_KEY_PATTERN,
} from '@/common/market/market-primitives';
import { ApiStandardErrors, ApiZodBody, ApiZodResponse } from '@/common/openapi/zod-openapi';
import { ZodValidationPipe } from '@/common/validation/zod-validation.pipe';
import { MarketStreamService } from '@/modules/market-stream/market-stream.service';
import { CurrentSession, SessionGuard } from '@/modules/session/session.guard';
import {
  ALERT_CONDITIONS,
  type Alert,
  type SessionRecord,
  USER_DATA_REPOSITORY,
  type UserDataRepository,
} from '@/modules/user-data/user-data.types';
import { AlertsService } from './alerts.service';

const id = z.object({ id: z.string().uuid() });
const createSchema = z
  .object({
    instrumentKey: z
      .string()
      .max(96)
      .refine(
        (k) => INSTRUMENT_KEY_PATTERN.test(k) || OPTION_CONTRACT_KEY_PATTERN.test(k),
        'TradeOS instrument or contract key expected',
      )
      .refine((k) => MarketStreamService.isAuthorizedKey(k, ['*']), 'unknown instrument'),
    condition: z.enum(ALERT_CONDITIONS),
    threshold: z.number().finite(),
    repeat: z.boolean().default(false),
    note: z.string().trim().max(160).optional(),
  })
  .refine(
    (a) =>
      !['OI_CHANGE_ABOVE', 'IV_ABOVE', 'IV_BELOW'].includes(a.condition) ||
      a.instrumentKey.includes(':OPT:'),
    { message: 'OI/IV conditions need an option contract key', path: ['condition'] },
  );
const patchSchema = z.object({
  threshold: z.number().finite().optional(),
  status: z.enum(['ACTIVE', 'DISABLED']).optional(),
  repeat: z.boolean().optional(),
  note: z.string().trim().max(160).nullable().optional(),
});
const alertSchema = z.object({
  id: z.string().uuid(),
  instrumentKey: z.string(),
  condition: z.enum(ALERT_CONDITIONS),
  threshold: z.number(),
  status: z.enum(['ACTIVE', 'TRIGGERED', 'DISABLED']),
  repeat: z.boolean(),
  note: z.string().nullable(),
  triggeredAt: z.number().nullable(),
  createdAt: z.number(),
});
const one = z.object({ data: alertSchema });
const many = z.object({ data: z.array(alertSchema) });
const view = ({ sessionId: _s, ...a }: Alert) => a;

/** Alerts evaluate on the server against the live market state; triggers become notifications. */
@ApiTags('alerts')
@Controller({ path: 'alerts', version: '1' })
@UseGuards(SessionGuard)
export class AlertsController {
  constructor(
    @Inject(USER_DATA_REPOSITORY) private readonly repo: UserDataRepository,
    private readonly alerts: AlertsService,
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'List alerts (newest first)' })
  @ApiZodResponse({ status: 200, description: 'Alerts', schema: many })
  @ApiStandardErrors(401)
  async list(@CurrentSession() s: SessionRecord) {
    return { data: (await this.repo.listAlerts(s.id)).map(view) };
  }

  @Post()
  @ApiOperation({
    summary: 'Create an alert (max 50 active per session)',
    description:
      'Conditions: ' +
      ALERT_CONDITIONS.join(', ') +
      '. PCR conditions are evaluated once a minute on the assembled chain; all others on every live update of the key.',
  })
  @ApiZodBody(createSchema)
  @ApiZodResponse({ status: 201, description: 'Created', schema: one })
  @ApiStandardErrors(400, 401)
  async create(
    @CurrentSession() s: SessionRecord,
    @Body(new ZodValidationPipe(createSchema)) body: z.infer<typeof createSchema>,
  ) {
    const alert = await this.repo
      .createAlert({
        sessionId: s.id,
        instrumentKey: body.instrumentKey,
        condition: body.condition,
        threshold: body.threshold,
        repeat: body.repeat,
        note: body.note ?? null,
      })
      .catch((e: unknown) => mapUserDataError(e, 'Active alert'));
    this.alerts.track(alert);
    return { data: view(alert) };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update threshold / status / repeat / note' })
  @ApiParam({ name: 'id' })
  @ApiZodBody(patchSchema)
  @ApiZodResponse({ status: 200, description: 'Updated', schema: one })
  @ApiStandardErrors(400, 401, 404)
  async update(
    @CurrentSession() s: SessionRecord,
    @Param(new ZodValidationPipe(id)) p: z.infer<typeof id>,
    @Body(new ZodValidationPipe(patchSchema)) body: z.infer<typeof patchSchema>,
  ) {
    const before =
      (await this.repo.listAlerts(s.id)).find((a) => a.id === p.id) ?? notFound('Alert');
    const patch: { -readonly [K in 'threshold' | 'status' | 'repeat' | 'note']?: Alert[K] } = {};
    if (body.threshold !== undefined) patch.threshold = body.threshold;
    if (body.status !== undefined) patch.status = body.status;
    if (body.repeat !== undefined) patch.repeat = body.repeat;
    if (body.note !== undefined) patch.note = body.note;
    const after = (await this.repo.updateAlert(s.id, p.id, patch)) ?? notFound('Alert');
    this.alerts.untrack(before);
    this.alerts.track(after);
    return { data: view(after) };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an alert' })
  @ApiParam({ name: 'id' })
  @ApiZodResponse({
    status: 200,
    description: 'Deleted',
    schema: z.object({ data: z.object({ deleted: z.literal(true) }) }),
  })
  @ApiStandardErrors(401, 404)
  async remove(
    @CurrentSession() s: SessionRecord,
    @Param(new ZodValidationPipe(id)) p: z.infer<typeof id>,
  ) {
    const before =
      (await this.repo.listAlerts(s.id)).find((a) => a.id === p.id) ?? notFound('Alert');
    if (!(await this.repo.deleteAlert(s.id, p.id))) notFound('Alert');
    this.alerts.untrack(before);
    return { data: { deleted: true as const } };
  }
}
