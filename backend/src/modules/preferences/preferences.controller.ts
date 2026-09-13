import { Body, Controller, Get, Header, Inject, Put, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ApiStandardErrors, ApiZodBody, ApiZodResponse } from '@/common/openapi/zod-openapi';
import { ZodValidationPipe } from '@/common/validation/zod-validation.pipe';
import { CurrentSession, SessionGuard } from '@/modules/session/session.guard';
import {
  type SessionRecord,
  USER_DATA_REPOSITORY,
  type UserDataRepository,
} from '@/modules/user-data/user-data.types';

/** Known preference keys are validated; unknown keys are rejected so the store stays bounded. */
export const preferencesSchema = z
  .object({
    theme: z.enum(['dark', 'light', 'system']),
    density: z.enum(['compact', 'comfortable']),
    optionChain: z.object({
      strikeWindow: z.union([z.literal(10), z.literal(20), z.literal(30), z.null()]),
      columnPreset: z.enum(['core', 'extended', 'greeks']),
    }),
    chart: z.object({
      interval: z.enum(['1m', '5m', '15m', '1h', '1d']),
      indicators: z.array(z.string().max(16)).max(8),
    }),
    notifications: z.object({ browser: z.boolean(), sound: z.boolean() }),
  })
  .partial()
  .strict();
export type PreferencesDto = z.infer<typeof preferencesSchema>;
const response = z.object({ data: preferencesSchema });

@ApiTags('preferences')
@Controller({ path: 'preferences', version: '1' })
@UseGuards(SessionGuard)
export class PreferencesController {
  constructor(@Inject(USER_DATA_REPOSITORY) private readonly repo: UserDataRepository) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Session preferences' })
  @ApiZodResponse({ status: 200, description: 'Preferences', schema: response })
  @ApiStandardErrors(401)
  async get(@CurrentSession() s: SessionRecord): Promise<{ data: PreferencesDto }> {
    return { data: preferencesSchema.parse(await this.repo.getPreferences(s.id)) };
  }

  @Put()
  @ApiOperation({ summary: 'Merge preferences (unknown keys rejected)' })
  @ApiZodBody(preferencesSchema)
  @ApiZodResponse({ status: 200, description: 'Merged preferences', schema: response })
  @ApiStandardErrors(400, 401)
  async put(
    @CurrentSession() s: SessionRecord,
    @Body(new ZodValidationPipe(preferencesSchema)) body: PreferencesDto,
  ) {
    return { data: preferencesSchema.parse(await this.repo.setPreferences(s.id, body)) };
  }
}
