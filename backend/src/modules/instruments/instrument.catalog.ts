import { buildInstrumentKey, type InstrumentKey } from '@/common/market/market-primitives';
import { type InstrumentDefinition } from './instrument-definition';

/**
 * The six-index catalog — backend source of truth for seeding and for
 * capability gating. Mirrors `frontend/src/features/market/config`.
 *
 * INDIA VIX is a volatility index: `hasOptionChain: false`, no lot size,
 * no strike step. Lot sizes / strike steps are exchange reference values;
 * the provider instrument master is authoritative once synced.
 */
export const INSTRUMENT_CATALOG: readonly InstrumentDefinition[] = [
  {
    instrumentKey: buildInstrumentKey('NSE', 'NIFTY50'),
    symbol: 'NIFTY50',
    name: 'Nifty 50',
    exchangeCode: 'NSE',
    kind: 'EQUITY_INDEX',
    tickSize: 0.05,
    hasOptionChain: true,
    lotSize: 75,
    strikeStep: 50,
  },
  {
    instrumentKey: buildInstrumentKey('NSE', 'BANKNIFTY'),
    symbol: 'BANKNIFTY',
    name: 'Nifty Bank',
    exchangeCode: 'NSE',
    kind: 'EQUITY_INDEX',
    tickSize: 0.05,
    hasOptionChain: true,
    lotSize: 35,
    strikeStep: 100,
  },
  {
    instrumentKey: buildInstrumentKey('NSE', 'FINNIFTY'),
    symbol: 'FINNIFTY',
    name: 'Nifty Financial Services',
    exchangeCode: 'NSE',
    kind: 'EQUITY_INDEX',
    tickSize: 0.05,
    hasOptionChain: true,
    lotSize: 65,
    strikeStep: 50,
  },
  {
    instrumentKey: buildInstrumentKey('NSE', 'INDIAVIX'),
    symbol: 'INDIAVIX',
    name: 'India VIX',
    exchangeCode: 'NSE',
    kind: 'VOLATILITY_INDEX',
    tickSize: 0.0025,
    hasOptionChain: false,
    lotSize: null,
    strikeStep: null,
  },
  {
    instrumentKey: buildInstrumentKey('BSE', 'SENSEX'),
    symbol: 'SENSEX',
    name: 'S&P BSE Sensex',
    exchangeCode: 'BSE',
    kind: 'EQUITY_INDEX',
    tickSize: 0.01,
    hasOptionChain: true,
    lotSize: 20,
    strikeStep: 100,
  },
  {
    instrumentKey: buildInstrumentKey('BSE', 'BANKEX'),
    symbol: 'BANKEX',
    name: 'S&P BSE Bankex',
    exchangeCode: 'BSE',
    kind: 'EQUITY_INDEX',
    tickSize: 0.01,
    hasOptionChain: true,
    lotSize: 30,
    strikeStep: 100,
  },
];

const byKey = new Map<InstrumentKey, InstrumentDefinition>(
  INSTRUMENT_CATALOG.map((i) => [i.instrumentKey, i]),
);

/* Integrity assertions at module load: a volatility index can never claim an option chain. */
for (const instrument of INSTRUMENT_CATALOG) {
  if (instrument.kind === 'VOLATILITY_INDEX' && instrument.hasOptionChain) {
    throw new Error(
      `Catalog integrity: ${instrument.instrumentKey} is volatility with option chain`,
    );
  }
  if (instrument.hasOptionChain && (!instrument.lotSize || !instrument.strikeStep)) {
    throw new Error(`Catalog integrity: ${instrument.instrumentKey} needs lotSize and strikeStep`);
  }
}
if (byKey.size !== INSTRUMENT_CATALOG.length) {
  throw new Error('Catalog integrity: duplicate instrument keys');
}

export function catalogInstrument(key: InstrumentKey): InstrumentDefinition | null {
  return byKey.get(key) ?? null;
}

export const OPTION_CHAIN_INSTRUMENT_KEYS: readonly InstrumentKey[] = INSTRUMENT_CATALOG.filter(
  (i) => i.hasOptionChain,
).map((i) => i.instrumentKey);
