import { describe, expect, it } from 'vitest';
import { marketCatalog, MARKET_INDEXES } from './index';

describe('market configuration', () => {
  it('registers exactly the six phase-1 indexes', () => {
    expect(MARKET_INDEXES.map((i) => i.code).sort()).toEqual(
      ['BANKEX', 'BANK_NIFTY', 'FINNIFTY', 'INDIA_VIX', 'NIFTY_50', 'SENSEX'].sort(),
    );
  });

  it('derives the Exchange → Category → Index hierarchy', () => {
    const tree = marketCatalog.tree();
    const shape = tree.map((ex) => ({
      exchange: ex.exchange.code,
      categories: ex.categories.map((c) => ({
        category: c.category.code,
        indexes: c.indexes.map((i) => i.code),
      })),
    }));
    expect(shape).toEqual([
      {
        exchange: 'NSE',
        categories: [
          { category: 'BENCHMARK', indexes: ['NIFTY_50'] },
          { category: 'FINANCIAL', indexes: ['BANK_NIFTY', 'FINNIFTY'] },
          { category: 'VOLATILITY', indexes: ['INDIA_VIX'] },
        ],
      },
      {
        exchange: 'BSE',
        categories: [
          { category: 'BENCHMARK', indexes: ['SENSEX'] },
          { category: 'FINANCIAL', indexes: ['BANKEX'] },
        ],
      },
    ]);
  });

  it('exposes option-chain capability explicitly and only for the five equity indexes', () => {
    const enabled = marketCatalog.optionChainIndexes().map((i) => i.code);
    expect(enabled).toEqual(['NIFTY_50', 'BANK_NIFTY', 'FINNIFTY', 'SENSEX', 'BANKEX']);
    expect(marketCatalog.indexByCode('INDIA_VIX').capabilities.hasOptionChain).toBe(false);
    expect(marketCatalog.indexByCode('INDIA_VIX').kind).toBe('VOLATILITY_INDEX');
    expect(marketCatalog.indexByCode('INDIA_VIX').capabilities.hasChart).toBe(true);
  });

  it('resolves and builds route paths symmetrically', () => {
    for (const index of marketCatalog.indexes()) {
      const path = marketCatalog.pathOf(index);
      expect(marketCatalog.indexByPath(path)?.code).toBe(index.code);
    }
    expect(marketCatalog.pathOf(marketCatalog.indexByCode('BANK_NIFTY'))).toEqual({
      exchange: 'nse',
      category: 'financial',
      index: 'bank-nifty',
    });
    expect(
      marketCatalog.indexByPath({ exchange: 'nse', category: 'benchmark', index: 'bank-nifty' }),
    ).toBeUndefined();
  });

  it('links every index to a registered instrument on the same exchange', () => {
    for (const index of marketCatalog.indexes()) {
      const instrument = marketCatalog.instrumentByKey(index.instrumentKey);
      expect(instrument.exchangeCode).toBe(index.exchangeCode);
      expect(instrument.kind).toBe(index.kind);
    }
  });

  it('orders neighbours by exchange, category and index order', () => {
    const first = marketCatalog.indexes()[0]!;
    expect(first.code).toBe('NIFTY_50');
    expect(marketCatalog.neighbours(first).previous).toBeNull();
    expect(marketCatalog.neighbours(first).next?.code).toBe('BANK_NIFTY');
    const last = marketCatalog.indexes().at(-1)!;
    expect(last.code).toBe('BANKEX');
    expect(marketCatalog.neighbours(last).next).toBeNull();
  });
});
