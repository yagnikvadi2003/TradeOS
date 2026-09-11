/**
 * Catalog — read-only, memoized derivations over the market configuration.
 * Components never iterate the raw config arrays directly; they use these
 * accessors so the hierarchy and lookups stay consistent (and O(1) where it
 * matters).
 */
import { type Exchange, type ExchangeCode } from '../domain/exchange';
import { type Instrument, type InstrumentKey } from '../domain/instrument';
import { type MarketCategory, type MarketCategoryCode } from '../domain/market-category';
import { type MarketIndex, type MarketIndexCode } from '../domain/market-index';
import { type MarketSessionSchedule } from '../domain/market-status';
import {
  EXCHANGES,
  INSTRUMENTS,
  MARKET_CATEGORIES,
  MARKET_INDEXES,
  MARKET_SESSIONS,
} from './market.config';

export interface MarketCategoryNode {
  readonly category: MarketCategory;
  readonly indexes: readonly MarketIndex[];
}

export interface MarketExchangeNode {
  readonly exchange: Exchange;
  readonly categories: readonly MarketCategoryNode[];
}

/** Path segments identifying an index route: `/markets/:exchange/:category/:index`. */
export interface MarketIndexPath {
  readonly exchange: string;
  readonly category: string;
  readonly index: string;
}

function byOrder<T extends { order: number }>(a: T, b: T): number {
  return a.order - b.order;
}

function assertUnique(label: string, values: readonly string[]): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      throw new Error(`Market configuration error: duplicate ${label} "${value}"`);
    }
    seen.add(value);
  }
}

const exchangeByCode = new Map<ExchangeCode, Exchange>();
const exchangeBySlug = new Map<string, Exchange>();
const categoryByCode = new Map<MarketCategoryCode, MarketCategory>();
const categoryBySlug = new Map<string, MarketCategory>();
const indexByCode = new Map<MarketIndexCode, MarketIndex>();
const indexByInstrumentKey = new Map<InstrumentKey, MarketIndex>();
const indexByPath = new Map<string, MarketIndex>();
const instrumentByKey = new Map<InstrumentKey, Instrument>();
const sessionByExchange = new Map<ExchangeCode, MarketSessionSchedule>();

function pathKey(exchange: string, category: string, index: string): string {
  return `${exchange}/${category}/${index}`;
}

function buildIndexes(): void {
  assertUnique(
    'exchange code',
    EXCHANGES.map((e) => e.code),
  );
  assertUnique(
    'exchange slug',
    EXCHANGES.map((e) => e.slug),
  );
  assertUnique(
    'category code',
    MARKET_CATEGORIES.map((c) => c.code),
  );
  assertUnique(
    'category slug',
    MARKET_CATEGORIES.map((c) => c.slug),
  );
  assertUnique(
    'index code',
    MARKET_INDEXES.map((i) => i.code),
  );
  assertUnique(
    'index slug',
    MARKET_INDEXES.map((i) => i.slug),
  );
  assertUnique(
    'index instrumentKey',
    MARKET_INDEXES.map((i) => i.instrumentKey),
  );
  assertUnique(
    'instrumentKey',
    INSTRUMENTS.map((i) => i.instrumentKey),
  );

  for (const exchange of EXCHANGES) {
    exchangeByCode.set(exchange.code, exchange);
    exchangeBySlug.set(exchange.slug, exchange);
  }
  for (const category of MARKET_CATEGORIES) {
    categoryByCode.set(category.code, category);
    categoryBySlug.set(category.slug, category);
  }
  for (const instrument of INSTRUMENTS) {
    instrumentByKey.set(instrument.instrumentKey, instrument);
  }
  for (const session of MARKET_SESSIONS) {
    sessionByExchange.set(session.exchangeCode, session);
  }
  for (const index of MARKET_INDEXES) {
    const exchange = exchangeByCode.get(index.exchangeCode);
    const category = categoryByCode.get(index.categoryCode);
    const instrument = instrumentByKey.get(index.instrumentKey);
    if (!exchange || !category || !instrument) {
      throw new Error(`Market configuration error: index "${index.code}" references unknown data`);
    }
    if (instrument.kind !== index.kind) {
      throw new Error(`Market configuration error: kind mismatch for "${index.code}"`);
    }
    if (index.kind === 'VOLATILITY_INDEX' && index.capabilities.hasOptionChain) {
      throw new Error(
        `Market configuration error: volatility index "${index.code}" cannot expose an option chain`,
      );
    }
    indexByCode.set(index.code, index);
    indexByInstrumentKey.set(index.instrumentKey, index);
    indexByPath.set(pathKey(exchange.slug, category.slug, index.slug), index);
  }
}

buildIndexes();

const sortedExchanges: readonly Exchange[] = [...EXCHANGES].sort(byOrder);
const sortedIndexes: readonly MarketIndex[] = [...MARKET_INDEXES].sort((a, b) => {
  const ea = exchangeByCode.get(a.exchangeCode)?.order ?? 0;
  const eb = exchangeByCode.get(b.exchangeCode)?.order ?? 0;
  if (ea !== eb) return ea - eb;
  const ca = categoryByCode.get(a.categoryCode)?.order ?? 0;
  const cb = categoryByCode.get(b.categoryCode)?.order ?? 0;
  if (ca !== cb) return ca - cb;
  return a.order - b.order;
});

const marketTree: readonly MarketExchangeNode[] = sortedExchanges.map((exchange) => {
  const categories = [...MARKET_CATEGORIES]
    .sort(byOrder)
    .map<MarketCategoryNode>((category) => ({
      category,
      indexes: sortedIndexes.filter(
        (index) => index.exchangeCode === exchange.code && index.categoryCode === category.code,
      ),
    }))
    .filter((node) => node.indexes.length > 0);
  return { exchange, categories };
});

export const marketCatalog = {
  exchanges(): readonly Exchange[] {
    return sortedExchanges;
  },
  categories(): readonly MarketCategory[] {
    return MARKET_CATEGORIES;
  },
  indexes(): readonly MarketIndex[] {
    return sortedIndexes;
  },
  instruments(): readonly Instrument[] {
    return INSTRUMENTS;
  },
  /** Exchange → Category → Index tree, ordered, with empty categories pruned. */
  tree(): readonly MarketExchangeNode[] {
    return marketTree;
  },
  exchangeByCode(code: ExchangeCode): Exchange {
    const exchange = exchangeByCode.get(code);
    if (!exchange) throw new Error(`Unknown exchange "${code}"`);
    return exchange;
  },
  exchangeBySlug(slug: string): Exchange | undefined {
    return exchangeBySlug.get(slug);
  },
  categoryByCode(code: MarketCategoryCode): MarketCategory {
    const category = categoryByCode.get(code);
    if (!category) throw new Error(`Unknown category "${code}"`);
    return category;
  },
  categoryBySlug(slug: string): MarketCategory | undefined {
    return categoryBySlug.get(slug);
  },
  indexByCode(code: MarketIndexCode): MarketIndex {
    const index = indexByCode.get(code);
    if (!index) throw new Error(`Unknown index "${code}"`);
    return index;
  },
  indexByInstrumentKey(key: InstrumentKey): MarketIndex | undefined {
    return indexByInstrumentKey.get(key);
  },
  /** Resolve a route path (`nse/financial/bank-nifty`) to its index, or undefined. */
  indexByPath(path: MarketIndexPath): MarketIndex | undefined {
    return indexByPath.get(pathKey(path.exchange, path.category, path.index));
  },
  pathOf(index: MarketIndex): MarketIndexPath {
    return {
      exchange: this.exchangeByCode(index.exchangeCode).slug,
      category: this.categoryByCode(index.categoryCode).slug,
      index: index.slug,
    };
  },
  hasInstrument(key: string): key is InstrumentKey {
    return instrumentByKey.has(key as InstrumentKey);
  },
  instrumentByKey(key: InstrumentKey): Instrument {
    const instrument = instrumentByKey.get(key);
    if (!instrument) throw new Error(`Unknown instrument "${key}"`);
    return instrument;
  },
  sessionOf(exchange: ExchangeCode): MarketSessionSchedule {
    const session = sessionByExchange.get(exchange);
    if (!session) throw new Error(`No session schedule for "${exchange}"`);
    return session;
  },
  /** Indexes whose explicit capability flag allows an option chain. */
  optionChainIndexes(): readonly MarketIndex[] {
    return sortedIndexes.filter((index) => index.capabilities.hasOptionChain);
  },
  /** Ordered flat list used for keyboard navigation and previous/next shortcuts. */
  neighbours(index: MarketIndex): { previous: MarketIndex | null; next: MarketIndex | null } {
    const position = sortedIndexes.findIndex((candidate) => candidate.code === index.code);
    return {
      previous: sortedIndexes[position - 1] ?? null,
      next: sortedIndexes[position + 1] ?? null,
    };
  },
} as const;

export type MarketCatalog = typeof marketCatalog;
