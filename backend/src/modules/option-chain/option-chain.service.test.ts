import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ExpiryNotFoundError,
  InstrumentNotFoundError,
  OptionChainNotSupportedError,
  ProviderPayloadInvalidError,
  ProviderUnavailableError,
} from '@/common/errors/domain-error';
import { InMemoryCacheStore } from '@/infrastructure/cache/in-memory-cache.store';
import { INSTRUMENT_CATALOG } from '@/modules/instruments/instrument.catalog';
import { MockMarketDataProvider } from '@/providers/mock/mock-market-data.provider';
import { type MarketDataProvider } from '@/providers/provider.interface';
import { fakeLogger, FIXED_NOW, testEnv } from '@/tests/fakes';
import { OptionChainService } from './option-chain.service';
import { InMemoryOptionChainRepository } from './repositories/in-memory-option-chain.repository';

function build(options: { provider?: MarketDataProvider; now?: () => number } = {}) {
  const now = options.now ?? (() => FIXED_NOW);
  const provider = options.provider ?? new MockMarketDataProvider({ now, strikesEachSide: 10 });
  const repository = new InMemoryOptionChainRepository(INSTRUMENT_CATALOG);
  const cache = new InMemoryCacheStore(now, 100, 0);
  const service = new OptionChainService(repository, provider, cache, testEnv(), now, fakeLogger());
  return { service, provider, repository, cache };
}

describe('OptionChainService', () => {
  let ctx: ReturnType<typeof build>;
  beforeEach(() => {
    ctx = build();
  });

  it('rejects unknown instruments and volatility indexes', async () => {
    await expect(ctx.service.getExpiries('NSE:INDEX:NOPE')).rejects.toBeInstanceOf(
      InstrumentNotFoundError,
    );
    await expect(ctx.service.getExpiries('NSE:INDEX:INDIAVIX')).rejects.toBeInstanceOf(
      OptionChainNotSupportedError,
    );
    await expect(ctx.service.getSnapshot('NSE:INDEX:INDIAVIX')).rejects.toBeInstanceOf(
      OptionChainNotSupportedError,
    );
  });

  it('lists expiries from the provider once, then serves them from the store', async () => {
    const spy = vi.spyOn(ctx.provider, 'listExpiries');
    const first = await ctx.service.getExpiries('NSE:INDEX:NIFTY50');
    const second = await ctx.service.getExpiries('NSE:INDEX:NIFTY50');
    expect(first.length).toBeGreaterThan(3);
    expect(first[0]).toMatchObject({ expiryDate: '2026-09-08', cycle: 'WEEKLY', daysToExpiry: 0 });
    expect(second).toEqual(first);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(await ctx.repository.findActiveExpiries('NSE:INDEX:NIFTY50')).toHaveLength(first.length);
  });

  it('returns metadata with nearest expiry and lot/strike configuration', async () => {
    const metadata = await ctx.service.getMetadata('BSE:INDEX:SENSEX');
    expect(metadata).toMatchObject({ symbol: 'SENSEX', lotSize: 20, strikeStep: 100 });
    expect(metadata.nearestExpiry).toBe(metadata.expiries[0]?.expiryDate);
  });

  it('assembles a snapshot for the nearest expiry, persisting contract metadata once', async () => {
    const contractsSpy = vi.spyOn(ctx.provider, 'listOptionContracts');
    const snapshot = await ctx.service.getSnapshot('NSE:INDEX:NIFTY50');
    expect(snapshot.expiry.expiryDate).toBe('2026-09-08');
    expect(snapshot.strikes).toHaveLength(21);
    expect(snapshot.strikes.filter((s) => s.isAtm)).toHaveLength(1);
    expect(snapshot.source).toBe('simulated');
    expect(snapshot.strikes.every((s) => s.ce && s.pe)).toBe(true);
    expect(await ctx.repository.findContracts('NSE:INDEX:NIFTY50', '2026-09-08')).toHaveLength(42);

    ctx.cache.sweep();
    await ctx.cache.delete('oc:snapshot:NSE:INDEX:NIFTY50:2026-09-08');
    await ctx.service.getSnapshot('NSE:INDEX:NIFTY50');
    expect(contractsSpy).toHaveBeenCalledTimes(1);
  });

  it('honours an explicit expiry and rejects unlisted ones', async () => {
    const expiries = await ctx.service.getExpiries('NSE:INDEX:NIFTY50');
    const monthly = expiries.find((e) => e.cycle === 'MONTHLY')!;
    const snapshot = await ctx.service.getSnapshot('NSE:INDEX:NIFTY50', monthly.expiryDate);
    expect(snapshot.expiry.expiryDate).toBe(monthly.expiryDate);
    await expect(ctx.service.getSnapshot('NSE:INDEX:NIFTY50', '2031-01-07')).rejects.toBeInstanceOf(
      ExpiryNotFoundError,
    );
  });

  it('coalesces concurrent snapshot requests into one provider round-trip and caches the result', async () => {
    const spy = vi.spyOn(ctx.provider, 'getOptionMarketData');
    const [a, b, c] = await Promise.all([
      ctx.service.getSnapshot('NSE:INDEX:BANKNIFTY'),
      ctx.service.getSnapshot('NSE:INDEX:BANKNIFTY'),
      ctx.service.getSnapshot('NSE:INDEX:BANKNIFTY'),
    ]);
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(spy).toHaveBeenCalledTimes(1);
    const cached = await ctx.service.getSnapshot('NSE:INDEX:BANKNIFTY');
    expect(cached).toBe(a);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('wraps provider failures as PROVIDER_UNAVAILABLE', async () => {
    const failing = build({
      provider: new MockMarketDataProvider({ failWith: new Error('boom') }),
    });
    await expect(failing.service.getSnapshot('NSE:INDEX:NIFTY50')).rejects.toBeInstanceOf(
      ProviderUnavailableError,
    );
  });

  it('rejects malformed provider expiries and drops malformed option rows', async () => {
    const base = new MockMarketDataProvider({ now: () => FIXED_NOW, strikesEachSide: 2 });
    const evil: MarketDataProvider = {
      name: 'mock',
      dataSource: 'simulated',
      listExpiries: () => Promise.resolve([{ expiryDate: '15-09-2026', cycle: 'WEEKLY' }]),
      listOptionContracts: (k, e) => base.listOptionContracts(k, e),
      getUnderlyingQuote: (k) => base.getUnderlyingQuote(k),
      getCandles: (k, i, c) => base.getCandles(k, i, c),
      getOptionMarketData: (k) => base.getOptionMarketData(k),
    };
    const bad = build({ provider: evil });
    await expect(bad.service.getExpiries('NSE:INDEX:NIFTY50')).rejects.toBeInstanceOf(
      ProviderPayloadInvalidError,
    );

    const partial: MarketDataProvider = {
      ...evil,
      listExpiries: (k) => base.listExpiries(k),
      getOptionMarketData: async (keys) => {
        const rows = await base.getOptionMarketData(keys);
        return [{ ...rows[0]!, openInterest: -5 }, ...rows.slice(1)];
      },
    };
    const lenient = build({ provider: partial });
    const snapshot = await lenient.service.getSnapshot('NSE:INDEX:NIFTY50');
    const dropped = snapshot.strikes
      .flatMap((s) => [s.ce, s.pe])
      .filter((l) => l?.market.ltp === null);
    expect(dropped).toHaveLength(1);
  });
});
