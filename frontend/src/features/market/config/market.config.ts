/**
 * Centralized market configuration — the single source of truth for the
 * Exchange → Category → Index hierarchy and instrument catalog.
 *
 * Everything the UI shows about markets (navigation tree, routes, capability
 * flags, SEO pages, sitemap) is DERIVED from this file. Do not duplicate any
 * of it in components.
 *
 * Note: this module is imported by both the browser bundle and the Vite build
 * (sitemap/robots generation), so it must stay dependency-free and use
 * relative imports only.
 */
import { type Exchange } from '../domain/exchange';
import { type Instrument, buildInstrumentKey } from '../domain/instrument';
import { type MarketCategory } from '../domain/market-category';
import { type MarketIndex } from '../domain/market-index';
import { type MarketSessionSchedule } from '../domain/market-status';

export const EXCHANGES: readonly Exchange[] = [
  {
    code: 'NSE',
    slug: 'nse',
    name: 'NSE',
    fullName: 'National Stock Exchange of India',
    timezone: 'Asia/Kolkata',
    currency: 'INR',
    order: 1,
  },
  {
    code: 'BSE',
    slug: 'bse',
    name: 'BSE',
    fullName: 'BSE Ltd (Bombay Stock Exchange)',
    timezone: 'Asia/Kolkata',
    currency: 'INR',
    order: 2,
  },
];

export const MARKET_CATEGORIES: readonly MarketCategory[] = [
  {
    code: 'BENCHMARK',
    slug: 'benchmark',
    name: 'Benchmark',
    description: 'Broad-market headline indexes.',
    order: 1,
  },
  {
    code: 'FINANCIAL',
    slug: 'financial',
    name: 'Financial',
    description: 'Banking and financial-services sector indexes.',
    order: 2,
  },
  {
    code: 'VOLATILITY',
    slug: 'volatility',
    name: 'Volatility',
    description: 'Implied-volatility indexes. Chart only — no option chain.',
    order: 3,
  },
];

const NIFTY50_KEY = buildInstrumentKey('NSE', 'INDEX', 'NIFTY50');
const BANKNIFTY_KEY = buildInstrumentKey('NSE', 'INDEX', 'BANKNIFTY');
const FINNIFTY_KEY = buildInstrumentKey('NSE', 'INDEX', 'FINNIFTY');
const INDIAVIX_KEY = buildInstrumentKey('NSE', 'INDEX', 'INDIAVIX');
const SENSEX_KEY = buildInstrumentKey('BSE', 'INDEX', 'SENSEX');
const BANKEX_KEY = buildInstrumentKey('BSE', 'INDEX', 'BANKEX');

export const INSTRUMENTS: readonly Instrument[] = [
  {
    instrumentKey: NIFTY50_KEY,
    symbol: 'NIFTY50',
    name: 'Nifty 50',
    exchangeCode: 'NSE',
    segment: 'INDEX',
    kind: 'EQUITY_INDEX',
    currency: 'INR',
    tickSize: 0.05,
  },
  {
    instrumentKey: BANKNIFTY_KEY,
    symbol: 'BANKNIFTY',
    name: 'Nifty Bank',
    exchangeCode: 'NSE',
    segment: 'INDEX',
    kind: 'EQUITY_INDEX',
    currency: 'INR',
    tickSize: 0.05,
  },
  {
    instrumentKey: FINNIFTY_KEY,
    symbol: 'FINNIFTY',
    name: 'Nifty Financial Services',
    exchangeCode: 'NSE',
    segment: 'INDEX',
    kind: 'EQUITY_INDEX',
    currency: 'INR',
    tickSize: 0.05,
  },
  {
    instrumentKey: INDIAVIX_KEY,
    symbol: 'INDIAVIX',
    name: 'India VIX',
    exchangeCode: 'NSE',
    segment: 'INDEX',
    kind: 'VOLATILITY_INDEX',
    currency: 'INR',
    tickSize: 0.0025,
  },
  {
    instrumentKey: SENSEX_KEY,
    symbol: 'SENSEX',
    name: 'S&P BSE Sensex',
    exchangeCode: 'BSE',
    segment: 'INDEX',
    kind: 'EQUITY_INDEX',
    currency: 'INR',
    tickSize: 0.01,
  },
  {
    instrumentKey: BANKEX_KEY,
    symbol: 'BANKEX',
    name: 'S&P BSE Bankex',
    exchangeCode: 'BSE',
    segment: 'INDEX',
    kind: 'EQUITY_INDEX',
    currency: 'INR',
    tickSize: 0.01,
  },
];

/**
 * Capability flags are explicit per index. INDIA VIX is a volatility
 * instrument: chart/volatility information only, `hasOptionChain: false`.
 */
export const MARKET_INDEXES: readonly MarketIndex[] = [
  {
    code: 'NIFTY_50',
    slug: 'nifty-50',
    name: 'NIFTY 50',
    shortName: 'NIFTY',
    exchangeCode: 'NSE',
    categoryCode: 'BENCHMARK',
    kind: 'EQUITY_INDEX',
    instrumentKey: NIFTY50_KEY,
    capabilities: { hasOptionChain: true, hasChart: true },
    description: 'NSE benchmark of the 50 largest Indian companies by free-float market cap.',
    order: 1,
  },
  {
    code: 'BANK_NIFTY',
    slug: 'bank-nifty',
    name: 'BANK NIFTY',
    shortName: 'BANKNIFTY',
    exchangeCode: 'NSE',
    categoryCode: 'FINANCIAL',
    kind: 'EQUITY_INDEX',
    instrumentKey: BANKNIFTY_KEY,
    capabilities: { hasOptionChain: true, hasChart: true },
    description: 'NSE index of the most liquid, large-cap Indian banking stocks.',
    order: 1,
  },
  {
    code: 'FINNIFTY',
    slug: 'finnifty',
    name: 'FINNIFTY',
    shortName: 'FINNIFTY',
    exchangeCode: 'NSE',
    categoryCode: 'FINANCIAL',
    kind: 'EQUITY_INDEX',
    instrumentKey: FINNIFTY_KEY,
    capabilities: { hasOptionChain: true, hasChart: true },
    description:
      'NSE financial-services index covering banks, NBFCs, insurers and housing finance.',
    order: 2,
  },
  {
    code: 'INDIA_VIX',
    slug: 'india-vix',
    name: 'INDIA VIX',
    shortName: 'VIX',
    exchangeCode: 'NSE',
    categoryCode: 'VOLATILITY',
    kind: 'VOLATILITY_INDEX',
    instrumentKey: INDIAVIX_KEY,
    capabilities: { hasOptionChain: false, hasChart: true },
    description: 'Expected 30-day volatility of NIFTY 50, derived from NIFTY option prices.',
    order: 1,
  },
  {
    code: 'SENSEX',
    slug: 'sensex',
    name: 'SENSEX',
    shortName: 'SENSEX',
    exchangeCode: 'BSE',
    categoryCode: 'BENCHMARK',
    kind: 'EQUITY_INDEX',
    instrumentKey: SENSEX_KEY,
    capabilities: { hasOptionChain: true, hasChart: true },
    description: 'BSE benchmark of 30 well-established, financially sound Indian companies.',
    order: 1,
  },
  {
    code: 'BANKEX',
    slug: 'bankex',
    name: 'BANKEX',
    shortName: 'BANKEX',
    exchangeCode: 'BSE',
    categoryCode: 'FINANCIAL',
    kind: 'EQUITY_INDEX',
    instrumentKey: BANKEX_KEY,
    capabilities: { hasOptionChain: true, hasChart: true },
    description: 'BSE index tracking the performance of listed Indian banking stocks.',
    order: 1,
  },
];

/**
 * Regular session schedules (IST, minutes since midnight). Both exchanges
 * share the same equity-segment hours. Holidays are out of scope for phase 1.
 */
export const MARKET_SESSIONS: readonly MarketSessionSchedule[] = [
  {
    exchangeCode: 'NSE',
    preOpen: { startMinutes: 9 * 60, endMinutes: 9 * 60 + 15 },
    regular: { startMinutes: 9 * 60 + 15, endMinutes: 15 * 60 + 30 },
    postClose: { startMinutes: 15 * 60 + 40, endMinutes: 16 * 60 },
    tradingWeekdays: [1, 2, 3, 4, 5],
  },
  {
    exchangeCode: 'BSE',
    preOpen: { startMinutes: 9 * 60, endMinutes: 9 * 60 + 15 },
    regular: { startMinutes: 9 * 60 + 15, endMinutes: 15 * 60 + 30 },
    postClose: { startMinutes: 15 * 60 + 40, endMinutes: 16 * 60 },
    tradingWeekdays: [1, 2, 3, 4, 5],
  },
];
