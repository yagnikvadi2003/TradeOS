import { Controller, Get, Header, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ApiStandardErrors, ApiZodResponse } from '@/common/openapi/zod-openapi';
import {
  underlyingMarketDataDtoSchema,
  responseMetaSchema,
} from '@/modules/option-chain/dto/option-chain.response';
import { INSTRUMENT_KEY_PATTERN, type InstrumentKey } from '@/common/market/market-primitives';
import { ZodValidationPipe } from '@/common/validation/zod-validation.pipe';
import { MarketQuotesService, type IndexQuoteDto } from './market-quotes.service';

const quotesQuerySchema = z.object({
  instrumentKeys: z
    .string()
    .min(3)
    .max(512)
    .transform((s) => [
      ...new Set(
        s
          .split(',')
          .map((k) => k.trim())
          .filter(Boolean),
      ),
    ])
    .pipe(z.array(z.string().regex(INSTRUMENT_KEY_PATTERN)).min(1).max(6)),
});

/**
 * Index-level snapshots for the six catalog instruments. This is the REST
 * *seed* for the header; realtime movement arrives over `/ws/market`.
 */
@ApiTags('market')
@Controller({ path: 'market', version: '1' })
export class MarketController {
  constructor(private readonly quotes: MarketQuotesService) {}

  @Get('quotes')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Index quote snapshots (REST seed; live values stream over /ws/market)',
  })
  @ApiQuery({
    name: 'instrumentKeys',
    required: true,
    example: 'NSE:INDEX:NIFTY50,BSE:INDEX:SENSEX',
    description: 'Comma-separated TradeOS instrument keys (max 6)',
  })
  @ApiZodResponse({
    status: 200,
    description: 'One quote per requested key, in request order',
    schema: z.object({ data: z.array(underlyingMarketDataDtoSchema), meta: responseMetaSchema }),
  })
  @ApiStandardErrors(400, 404, 429, 503)
  async getQuotes(
    @Query(new ZodValidationPipe(quotesQuerySchema)) query: z.infer<typeof quotesQuerySchema>,
  ): Promise<{ data: IndexQuoteDto[]; meta: { version: 'v1'; generatedAt: number } }> {
    const data = await this.quotes.getQuotes(query.instrumentKeys as InstrumentKey[]);
    return { data, meta: { version: 'v1', generatedAt: Date.now() } };
  }
}
