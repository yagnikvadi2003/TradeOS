import { Controller, Get, Header, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ApiStandardErrors, ApiZodQuery, ApiZodResponse } from '@/common/openapi/zod-openapi';
import { ZodValidationPipe } from '@/common/validation/zod-validation.pipe';
import { INSTRUMENT_CATALOG } from './instrument.catalog';

const querySchema = z.object({
  exchange: z.enum(['NSE', 'BSE']).optional(),
  optionChain: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
});

export const instrumentDtoSchema = z.object({
  instrumentKey: z.string().describe('TradeOS key, e.g. NSE:INDEX:NIFTY50'),
  symbol: z.string(),
  name: z.string(),
  exchangeCode: z.enum(['NSE', 'BSE']),
  kind: z.enum(['EQUITY_INDEX', 'VOLATILITY_INDEX']),
  tickSize: z.number(),
  capabilities: z.object({
    optionChain: z.boolean().describe('False for INDIA VIX and any volatility index'),
    chart: z.boolean(),
    realtime: z.boolean(),
  }),
  lotSize: z.number().int().nullable(),
  strikeStep: z.number().nullable(),
});
const responseSchema = z.object({ data: z.array(instrumentDtoSchema) });

/** The supported instrument set with explicit capability flags (configuration for clients). */
@ApiTags('market')
@Controller({ path: 'instruments', version: '1' })
export class InstrumentsController {
  @Get()
  @Header('Cache-Control', 'public, max-age=300')
  @ApiOperation({ summary: 'Supported instruments and their capabilities' })
  @ApiZodQuery(querySchema, {
    exchange: 'Filter by exchange',
    optionChain: 'Filter by option-chain capability',
  })
  @ApiZodResponse({ status: 200, description: 'Instrument catalog', schema: responseSchema })
  @ApiStandardErrors(400, 429)
  list(
    @Query(new ZodValidationPipe(querySchema)) query: z.infer<typeof querySchema>,
  ): z.infer<typeof responseSchema> {
    const data = INSTRUMENT_CATALOG.filter(
      (i) =>
        (query.exchange === undefined || i.exchangeCode === query.exchange) &&
        (query.optionChain === undefined || i.hasOptionChain === query.optionChain),
    ).map((i) => ({
      instrumentKey: i.instrumentKey,
      symbol: i.symbol,
      name: i.name,
      exchangeCode: i.exchangeCode,
      kind: i.kind,
      tickSize: i.tickSize,
      capabilities: { optionChain: i.hasOptionChain, chart: true, realtime: true },
      lotSize: i.lotSize,
      strikeStep: i.strikeStep,
    }));
    return { data };
  }
}
