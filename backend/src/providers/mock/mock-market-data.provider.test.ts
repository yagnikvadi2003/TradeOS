import { describe, expect, it } from 'vitest';
import { OptionChainNotSupportedError } from '@/common/errors/domain-error';
import { providerOptionMarketDataSchema, providerUnderlyingSchema } from '../provider.schemas';
import { MockMarketDataProvider } from './mock-market-data.provider';

// Tue 08 Sep 2026 11:00 IST — regular session, before Tuesday's expiry close.
const FIXED_NOW = Date.UTC(2026, 8, 8, 5, 30);

function provider(now = FIXED_NOW, strikesEachSide = 5) {
  return new MockMarketDataProvider({ now: () => now, strikesEachSide });
}

describe('MockMarketDataProvider', () => {
  it('lists NIFTY 50 weeklies on Tuesdays plus monthly expiries, sorted', async () => {
    const expiries = await provider().listExpiries('NSE:INDEX:NIFTY50');
    expect(expiries[0]).toEqual({ expiryDate: '2026-09-08', cycle: 'WEEKLY' });
    expect(expiries.map((e) => e.expiryDate)).toEqual(
      [...expiries.map((e) => e.expiryDate)].sort(),
    );
    expect(expiries.filter((e) => e.cycle === 'MONTHLY').length).toBeGreaterThanOrEqual(3);
    for (const e of expiries) {
      expect(new Date(`${e.expiryDate}T00:00:00Z`).getUTCDay()).toBe(2);
    }
  });

  it('rolls past an expiry once the session has closed', async () => {
    const after = Date.UTC(2026, 8, 8, 10, 30); // 16:00 IST
    const expiries = await provider(after).listExpiries('NSE:INDEX:NIFTY50');
    expect(expiries[0]?.expiryDate).toBe('2026-09-15');
  });

  it('gives BANKEX monthly Thursday expiries only', async () => {
    const expiries = await provider().listExpiries('BSE:INDEX:BANKEX');
    expect(expiries.every((e) => e.cycle === 'MONTHLY')).toBe(true);
    expect(expiries[0]?.expiryDate).toBe('2026-09-24');
  });

  it('refuses INDIA VIX', async () => {
    await expect(provider().listExpiries('NSE:INDEX:INDIAVIX')).rejects.toBeInstanceOf(
      OptionChainNotSupportedError,
    );
  });

  it('generates a CE and PE per strike on the instrument strike step', async () => {
    const contracts = await provider().listOptionContracts('NSE:INDEX:BANKNIFTY', '2026-09-29');
    expect(contracts).toHaveLength(11 * 2);
    const strikes = [...new Set(contracts.map((c) => c.strike))];
    for (let i = 1; i < strikes.length; i += 1) {
      expect(strikes[i]! - strikes[i - 1]!).toBe(100);
    }
    expect(contracts[0]?.contractKey).toMatch(/^NSE:OPT:BANKNIFTY:2026-09-29:\d+:(CE|PE)$/);
    expect(contracts[0]?.lotSize).toBe(35);
  });

  it('is deterministic within a bucket and validates against the boundary schema', async () => {
    const p = provider();
    const contracts = await p.listOptionContracts('NSE:INDEX:NIFTY50', '2026-09-15');
    const keys = contracts.map((c) => c.contractKey);
    const a = await p.getOptionMarketData(keys);
    const b = await p.getOptionMarketData(keys);
    expect(a).toEqual(b);
    expect(a).toHaveLength(keys.length);
    for (const quote of a) {
      expect(providerOptionMarketDataSchema.safeParse(quote).success).toBe(true);
      expect(quote.source).toBe('simulated');
      expect(quote.bid!).toBeLessThanOrEqual(quote.ltp!);
      expect(quote.ask!).toBeGreaterThanOrEqual(quote.ltp!);
    }
    const underlying = await p.getUnderlyingQuote('NSE:INDEX:NIFTY50');
    expect(providerUnderlyingSchema.safeParse(underlying).success).toBe(true);
  });

  it('prices calls and puts consistently around the money', async () => {
    const p = provider(FIXED_NOW, 20);
    const underlying = await p.getUnderlyingQuote('NSE:INDEX:NIFTY50');
    const contracts = await p.listOptionContracts('NSE:INDEX:NIFTY50', '2026-09-29');
    const quotes = await p.getOptionMarketData(contracts.map((c) => c.contractKey));
    const byKey = new Map(quotes.map((q) => [q.contractKey, q]));
    const deepItmCall = contracts.find(
      (c) => c.optionType === 'CE' && c.strike < underlying.ltp - 200,
    )!;
    const deepOtmCall = contracts.find(
      (c) => c.optionType === 'CE' && c.strike > underlying.ltp + 200,
    )!;
    expect(byKey.get(deepItmCall.contractKey)!.ltp!).toBeGreaterThan(
      byKey.get(deepOtmCall.contractKey)!.ltp!,
    );
    expect(byKey.get(deepItmCall.contractKey)!.greeks!.delta).toBeGreaterThan(0.5);
    const put = contracts.find((c) => c.optionType === 'PE')!;
    expect(byKey.get(put.contractKey)!.greeks!.delta).toBeLessThan(0);
  });

  it('skips malformed contract keys instead of throwing', async () => {
    const quotes = await provider().getOptionMarketData(['garbage' as never]);
    expect(quotes).toEqual([]);
  });

  it('surfaces injected failures', async () => {
    const failing = new MockMarketDataProvider({ failWith: new Error('down') });
    await expect(failing.getUnderlyingQuote('NSE:INDEX:NIFTY50')).rejects.toThrow('down');
  });
});
