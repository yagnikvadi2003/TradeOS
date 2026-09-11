import { Inject, Injectable } from '@nestjs/common';
import { InstrumentNotFoundError } from '@/common/errors/domain-error';
import { type InstrumentKey } from '@/common/market/market-primitives';
import { CACHE_STORE, type CacheStore } from '@/infrastructure/cache/cache-store.interface';
import {
  MARKET_STATE_STORE,
  type MarketStateStore,
} from '@/infrastructure/realtime/market-state.store';
import { catalogInstrument } from '@/modules/instruments/instrument.catalog';
import { type UnderlyingMarketData } from '@/modules/option-chain/domain';
import { MARKET_DATA_PROVIDER, type MarketDataProvider } from '@/providers/provider.interface';

export type IndexQuoteDto = UnderlyingMarketData;

const QUOTE_TTL_MS = 2_000;

/**
 * Quote seed with three tiers, cheapest first: live state store (free) →
 * short cache (coalesces bursts) → provider (one call). Unknown keys are a
 * 404, never a provider call.
 */
@Injectable()
export class MarketQuotesService {
  private readonly inflight = new Map<string, Promise<UnderlyingMarketData>>();

  constructor(
    @Inject(MARKET_DATA_PROVIDER) private readonly provider: MarketDataProvider,
    @Inject(MARKET_STATE_STORE) private readonly liveState: MarketStateStore,
    @Inject(CACHE_STORE) private readonly cache: CacheStore,
  ) {}

  async getQuotes(keys: readonly InstrumentKey[]): Promise<IndexQuoteDto[]> {
    for (const key of keys) if (!catalogInstrument(key)) throw new InstrumentNotFoundError(key);
    return Promise.all(keys.map((key) => this.getQuote(key)));
  }

  private async getQuote(key: InstrumentKey): Promise<UnderlyingMarketData> {
    const live = this.liveState.get(key);
    if (live?.kind === 'index' && live.ltp !== null && live.previousClose !== null) {
      const change = live.change ?? round(live.ltp - live.previousClose);
      return {
        instrumentKey: key,
        ltp: live.ltp,
        previousClose: live.previousClose,
        open: live.open ?? live.ltp,
        high: live.high ?? live.ltp,
        low: live.low ?? live.ltp,
        change,
        changePercent: live.changePercent ?? round((change / live.previousClose) * 100),
        updatedAt: live.timestamp,
        source: live.source,
      };
    }
    const cacheKey = `quote:${key}`;
    const cached = await this.cache.get<UnderlyingMarketData>(cacheKey);
    if (cached) return cached;
    let pending = this.inflight.get(cacheKey);
    if (!pending) {
      pending = this.provider
        .getUnderlyingQuote(key)
        .then(async (quote) => {
          await this.cache.set(cacheKey, quote, QUOTE_TTL_MS);
          return quote;
        })
        .finally(() => this.inflight.delete(cacheKey));
      this.inflight.set(cacheKey, pending);
    }
    return pending;
  }
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
