import { Controller, Get, Header, Inject, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ISO_DATE_PATTERN, istIsoDate } from '@/common/market/market-primitives';
import { ApiStandardErrors, ApiZodQuery, ApiZodResponse } from '@/common/openapi/zod-openapi';
import { ZodValidationPipe } from '@/common/validation/zod-validation.pipe';
import { USER_DATA_REPOSITORY, type UserDataRepository } from '@/modules/user-data/user-data.types';
import { resolveSessionState, SESSION_SCHEDULE } from './session-state';

const query = z
  .object({
    exchange: z.enum(['NSE', 'BSE']),
    from: z.string().regex(ISO_DATE_PATTERN).optional(),
    to: z.string().regex(ISO_DATE_PATTERN).optional(),
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, {
    message: 'from must not exceed to',
    path: ['to'],
  });
const daySchema = z.object({
  date: z.string(),
  kind: z.enum(['HOLIDAY', 'SPECIAL_SESSION']),
  description: z.string(),
  openMinutes: z.number().int().nullable(),
  closeMinutes: z.number().int().nullable(),
});
const response = z.object({
  data: z.object({
    exchange: z.enum(['NSE', 'BSE']),
    schedule: z.object({
      openMinutes: z.number().int(),
      closeMinutes: z.number().int(),
      timezone: z.literal('Asia/Kolkata'),
    }),
    today: z.object({
      date: z.string(),
      state: z.enum(['PRE_OPEN', 'OPEN', 'CLOSED', 'HOLIDAY', 'SPECIAL_SESSION']),
      isTradingDay: z.boolean(),
      nextOpenAt: z.number().nullable(),
    }),
    days: z.array(daySchema),
  }),
});

/**
 * Exchange calendar: regular session schedule plus operator-loaded holidays
 * and special sessions from the official circulars (`market_calendar_days`).
 * When no rows exist for a date the regular schedule applies. Nothing is
 * inferred or guessed.
 */
@ApiTags('market')
@Controller({ path: 'market-calendar', version: '1' })
export class MarketCalendarController {
  constructor(@Inject(USER_DATA_REPOSITORY) private readonly repo: UserDataRepository) {}

  @Get()
  @Header('Cache-Control', 'public, max-age=300')
  @ApiOperation({
    summary:
      'Session schedule, today’s state and holidays/special sessions in a range (default: 60 days)',
  })
  @ApiZodQuery(query, {
    exchange: 'NSE or BSE',
    from: 'YYYY-MM-DD (default today)',
    to: 'YYYY-MM-DD (default from + 60 days)',
  })
  @ApiZodResponse({ status: 200, description: 'Calendar', schema: response })
  @ApiStandardErrors(400, 429)
  async get(
    @Query(new ZodValidationPipe(query)) q: z.infer<typeof query>,
  ): Promise<z.infer<typeof response>> {
    const now = Date.now();
    const today = istIsoDate(now);
    const from = q.from ?? today;
    const to = q.to ?? istIsoDate(Date.parse(`${from}T00:00:00Z`) + 60 * 86_400_000);
    const days = await this.repo.listCalendarDays(q.exchange, from < today ? from : today, to);
    const state = resolveSessionState(q.exchange, now, days);
    return {
      data: {
        exchange: q.exchange,
        schedule: {
          openMinutes: SESSION_SCHEDULE[q.exchange].openMinutes,
          closeMinutes: SESSION_SCHEDULE[q.exchange].closeMinutes,
          timezone: 'Asia/Kolkata',
        },
        today: { date: today, ...state },
        days: days.filter((d) => d.date >= from).map(({ exchangeCode: _e, ...d }) => d),
      },
    };
  }
}
