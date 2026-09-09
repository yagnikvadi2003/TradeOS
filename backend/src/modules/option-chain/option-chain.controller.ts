import { Controller, Get, Header, Inject, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { type InstrumentKey } from '@/common/market/market-primitives';
import { ZodValidationPipe } from '@/common/validation/zod-validation.pipe';
import {
  type ExpiriesResponse,
  expiriesResponseSchema,
  type MetadataResponse,
  metadataResponseSchema,
  type SnapshotResponse,
  snapshotResponseSchema,
} from './dto/option-chain.response';
import {
  type InstrumentParam,
  instrumentParamSchema,
  type SnapshotQuery,
  snapshotQuerySchema,
} from './dto/option-chain.params';
import {
  responseMeta,
  toExpiryDto,
  toMetadataDto,
  toSnapshotDto,
} from './mappers/option-chain.mapper';
import { CLOCK, type Clock, OptionChainService } from './option-chain.service';

const INSTRUMENT_PARAM = {
  name: 'instrument',
  description: 'TradeOS instrument key, e.g. `NSE:INDEX:NIFTY50` (URL-encode the colons).',
  example: 'NSE:INDEX:NIFTY50',
};

/**
 * REST surface for the option chain. Snapshots only — realtime deltas arrive
 * over the application WebSocket in a later phase, never by polling here.
 */
@ApiTags('option-chain')
@Controller({ path: 'option-chain', version: '1' })
export class OptionChainController {
  constructor(
    private readonly service: OptionChainService,
    @Inject(CLOCK) private readonly now: Clock,
  ) {}

  @Get(':instrument')
  @Header('Cache-Control', 'private, max-age=60')
  @ApiOperation({ summary: 'Option-chain metadata (lot size, strike step, expiries)' })
  @ApiParam(INSTRUMENT_PARAM)
  @ApiResponse({ status: 200, schema: z.toJSONSchema(metadataResponseSchema) as never })
  @ApiResponse({
    status: 404,
    description: 'Unknown instrument or no option chain (e.g. INDIA VIX)',
  })
  async getMetadata(
    @Param(new ZodValidationPipe(instrumentParamSchema)) params: InstrumentParam,
  ): Promise<MetadataResponse> {
    const metadata = await this.service.getMetadata(params.instrument as InstrumentKey);
    return { data: toMetadataDto(metadata), meta: responseMeta(this.now()) };
  }

  @Get(':instrument/expiries')
  @Header('Cache-Control', 'private, max-age=60')
  @ApiOperation({ summary: 'Listed expiries for an option-chain instrument' })
  @ApiParam(INSTRUMENT_PARAM)
  @ApiResponse({ status: 200, schema: z.toJSONSchema(expiriesResponseSchema) as never })
  async getExpiries(
    @Param(new ZodValidationPipe(instrumentParamSchema)) params: InstrumentParam,
  ): Promise<ExpiriesResponse> {
    const expiries = await this.service.getExpiries(params.instrument as InstrumentKey);
    return { data: expiries.map(toExpiryDto), meta: responseMeta(this.now()) };
  }

  @Get(':instrument/snapshot')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Full option-chain snapshot for one expiry (nearest by default)' })
  @ApiParam(INSTRUMENT_PARAM)
  @ApiQuery({ name: 'expiry', required: false, example: '2026-09-15', description: 'YYYY-MM-DD' })
  @ApiResponse({ status: 200, schema: z.toJSONSchema(snapshotResponseSchema) as never })
  @ApiResponse({ status: 503, description: 'Market data provider unavailable' })
  async getSnapshot(
    @Param(new ZodValidationPipe(instrumentParamSchema)) params: InstrumentParam,
    @Query(new ZodValidationPipe(snapshotQuerySchema)) query: SnapshotQuery,
  ): Promise<SnapshotResponse> {
    const snapshot = await this.service.getSnapshot(
      params.instrument as InstrumentKey,
      query.expiry,
    );
    return { data: toSnapshotDto(snapshot), meta: responseMeta(this.now()) };
  }
}
