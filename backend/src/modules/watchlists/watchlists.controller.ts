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
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { mapUserDataError, notFound } from '@/common/errors/user-data-errors';
import { INSTRUMENT_KEY_PATTERN } from '@/common/market/market-primitives';
import { ApiStandardErrors, ApiZodBody, ApiZodResponse } from '@/common/openapi/zod-openapi';
import { ZodValidationPipe } from '@/common/validation/zod-validation.pipe';
import { catalogInstrument } from '@/modules/instruments/instrument.catalog';
import { CurrentSession, SessionGuard } from '@/modules/session/session.guard';
import {
  type SessionRecord,
  USER_DATA_REPOSITORY,
  type UserDataRepository,
  type Watchlist,
} from '@/modules/user-data/user-data.types';

const id = z.object({ id: z.string().uuid() });
const name = z.object({ name: z.string().trim().min(1).max(64) });
const item = z.object({
  instrumentKey: z
    .string()
    .regex(INSTRUMENT_KEY_PATTERN)
    .refine((k) => catalogInstrument(k as never) !== null, 'unknown instrument'),
});
const order = z.object({ ids: z.array(z.string().uuid()).min(1).max(10) });
const itemOrder = z.object({
  instrumentKeys: z.array(z.string().regex(INSTRUMENT_KEY_PATTERN)).min(1).max(50),
});
const watchlistSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  position: z.number().int(),
  updatedAt: z.number().int(),
  items: z.array(
    z.object({ instrumentKey: z.string(), position: z.number().int(), addedAt: z.number().int() }),
  ),
});
const one = z.object({ data: watchlistSchema });
const many = z.object({ data: z.array(watchlistSchema) });

/**
 * Watchlists are session-owned metadata (which instruments a user tracks);
 * their prices come from `/ws/market` like everything else — nothing here
 * returns market data.
 */
@ApiTags('watchlists')
@Controller({ path: 'watchlists', version: '1' })
@UseGuards(SessionGuard)
export class WatchlistsController {
  constructor(@Inject(USER_DATA_REPOSITORY) private readonly repo: UserDataRepository) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'List the session’s watchlists with items' })
  @ApiZodResponse({ status: 200, description: 'Watchlists', schema: many })
  @ApiStandardErrors(401)
  async list(@CurrentSession() s: SessionRecord): Promise<{ data: Watchlist[] }> {
    return { data: await this.repo.listWatchlists(s.id) };
  }

  @Post()
  @ApiOperation({ summary: 'Create a watchlist (max 10 per session)' })
  @ApiZodBody(name)
  @ApiZodResponse({ status: 201, description: 'Created', schema: one })
  @ApiStandardErrors(400, 401)
  async create(
    @CurrentSession() s: SessionRecord,
    @Body(new ZodValidationPipe(name)) body: z.infer<typeof name>,
  ) {
    return {
      data: await this.repo
        .createWatchlist(s.id, body.name)
        .catch((e: unknown) => mapUserDataError(e, 'Watchlist')),
    };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Rename a watchlist' })
  @ApiParam({ name: 'id' })
  @ApiZodBody(name)
  @ApiZodResponse({ status: 200, description: 'Renamed', schema: one })
  @ApiStandardErrors(400, 401, 404)
  async rename(
    @CurrentSession() s: SessionRecord,
    @Param(new ZodValidationPipe(id)) p: z.infer<typeof id>,
    @Body(new ZodValidationPipe(name)) body: z.infer<typeof name>,
  ) {
    const w = await this.repo
      .renameWatchlist(s.id, p.id, body.name)
      .catch((e: unknown) => mapUserDataError(e, 'Watchlist'));
    return { data: w ?? notFound('Watchlist') };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a watchlist' })
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
    if (!(await this.repo.deleteWatchlist(s.id, p.id))) notFound('Watchlist');
    return { data: { deleted: true as const } };
  }

  @Put('order')
  @ApiOperation({ summary: 'Reorder watchlists' })
  @ApiZodBody(order)
  @ApiZodResponse({ status: 200, description: 'Reordered', schema: many })
  @ApiStandardErrors(400, 401)
  async reorder(
    @CurrentSession() s: SessionRecord,
    @Body(new ZodValidationPipe(order)) body: z.infer<typeof order>,
  ) {
    await this.repo.reorderWatchlists(s.id, body.ids);
    return { data: await this.repo.listWatchlists(s.id) };
  }

  @Post(':id/items')
  @ApiOperation({ summary: 'Add an instrument (max 50 per watchlist; idempotent)' })
  @ApiParam({ name: 'id' })
  @ApiZodBody(item)
  @ApiZodResponse({ status: 201, description: 'Updated watchlist', schema: one })
  @ApiStandardErrors(400, 401, 404)
  async addItem(
    @CurrentSession() s: SessionRecord,
    @Param(new ZodValidationPipe(id)) p: z.infer<typeof id>,
    @Body(new ZodValidationPipe(item)) body: z.infer<typeof item>,
  ) {
    const w = await this.repo
      .addWatchlistItem(s.id, p.id, body.instrumentKey)
      .catch((e: unknown) => mapUserDataError(e, 'Watchlist item'));
    return { data: w ?? notFound('Watchlist') };
  }

  @Delete(':id/items/:instrumentKey')
  @ApiOperation({ summary: 'Remove an instrument' })
  @ApiParam({ name: 'id' })
  @ApiParam({ name: 'instrumentKey', example: 'NSE:INDEX:NIFTY50' })
  @ApiZodResponse({ status: 200, description: 'Updated watchlist', schema: one })
  @ApiStandardErrors(400, 401, 404)
  async removeItem(
    @CurrentSession() s: SessionRecord,
    @Param(
      new ZodValidationPipe(id.extend({ instrumentKey: z.string().regex(INSTRUMENT_KEY_PATTERN) })),
    )
    p: { id: string; instrumentKey: string },
  ) {
    const w = await this.repo.removeWatchlistItem(s.id, p.id, p.instrumentKey);
    return { data: w ?? notFound('Watchlist') };
  }

  @Put(':id/items/order')
  @ApiOperation({ summary: 'Reorder instruments within a watchlist' })
  @ApiParam({ name: 'id' })
  @ApiZodBody(itemOrder)
  @ApiZodResponse({ status: 200, description: 'Updated watchlist', schema: one })
  @ApiStandardErrors(400, 401, 404)
  async reorderItems(
    @CurrentSession() s: SessionRecord,
    @Param(new ZodValidationPipe(id)) p: z.infer<typeof id>,
    @Body(new ZodValidationPipe(itemOrder)) body: z.infer<typeof itemOrder>,
  ) {
    const w = await this.repo.reorderWatchlistItems(s.id, p.id, body.instrumentKeys);
    return { data: w ?? notFound('Watchlist') };
  }
}
