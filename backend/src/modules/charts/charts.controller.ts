import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { type InstrumentKey } from '@/common/market/market-primitives';
import { ApiStandardErrors, ApiZodQuery, ApiZodResponse } from '@/common/openapi/zod-openapi';
import { ZodValidationPipe } from '@/common/validation/zod-validation.pipe';
import { ChartsService } from './charts.service';
import {
  candlesQuerySchema,
  type CandlesQuery,
  type CandlesResponse,
  candlesResponseSchema,
  chartInstrumentParamSchema,
} from './dto/charts.dto';

/**
 * Historical OHLC for the chart panel. REST by design: bars are history;
 * the current bar moves through `/ws/market` ticks on the client.
 */
@ApiTags('charts')
@Controller({ path: 'charts', version: '1' })
export class ChartsController {
  constructor(private readonly charts: ChartsService) {}

  @Get(':instrument/candles')
  @Header('Cache-Control', 'private, max-age=15')
  @ApiOperation({ summary: 'Historical candles for an index (newest last)' })
  @ApiParam({
    name: 'instrument',
    example: 'NSE:INDEX:NIFTY50',
    description: 'TradeOS instrument key',
  })
  @ApiZodQuery(candlesQuerySchema, {
    interval: 'Bar size; intraday intervals cover recent sessions, 1d covers about a year',
    limit: 'Maximum bars returned (newest kept), 10–2000',
  })
  @ApiZodResponse({ status: 200, description: 'Candle series', schema: candlesResponseSchema })
  @ApiStandardErrors(400, 404, 429, 502, 503)
  async getCandles(
    @Param(new ZodValidationPipe(chartInstrumentParamSchema))
    params: z.infer<typeof chartInstrumentParamSchema>,
    @Query(new ZodValidationPipe(candlesQuerySchema)) query: CandlesQuery,
  ): Promise<CandlesResponse> {
    const series = await this.charts.getCandles(
      params.instrument as InstrumentKey,
      query.interval,
      query.limit,
    );
    return {
      data: {
        instrumentKey: series.instrumentKey,
        interval: series.interval,
        candles: series.candles.map((c) => ({ ...c })),
        source: series.source,
      },
      meta: { version: 'v1', generatedAt: Date.now() },
    };
  }
}
