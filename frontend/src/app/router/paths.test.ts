import { describe, expect, it } from 'vitest';
import { marketCatalog } from '@/features/market/config';
import { paths, routeVisibility } from './paths';

describe('paths', () => {
  it('builds the agreed URL structure for every index', () => {
    const urls = marketCatalog.indexes().map((i) => paths.marketIndex(marketCatalog.pathOf(i)));
    expect(urls).toEqual([
      '/markets/nse/benchmark/nifty-50',
      '/markets/nse/financial/bank-nifty',
      '/markets/nse/financial/finnifty',
      '/markets/nse/volatility/india-vix',
      '/markets/bse/benchmark/sensex',
      '/markets/bse/financial/bankex',
    ]);
  });

  it('nests the option-chain route under the index and marks it private', () => {
    const vix = marketCatalog.indexByCode('INDIA_VIX');
    expect(paths.optionChain(marketCatalog.pathOf(vix))).toBe(
      '/markets/nse/volatility/india-vix/option-chain',
    );
    expect(routeVisibility.optionChain).toBe('private');
    expect(routeVisibility.marketIndex).toBe('public');
  });
});
