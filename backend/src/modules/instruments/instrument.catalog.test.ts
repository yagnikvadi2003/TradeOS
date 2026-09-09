import { describe, expect, it } from 'vitest';
import {
  catalogInstrument,
  INSTRUMENT_CATALOG,
  OPTION_CHAIN_INSTRUMENT_KEYS,
} from './instrument.catalog';

describe('instrument catalog', () => {
  it('lists exactly the six indexes', () => {
    expect(INSTRUMENT_CATALOG.map((i) => i.instrumentKey)).toEqual([
      'NSE:INDEX:NIFTY50',
      'NSE:INDEX:BANKNIFTY',
      'NSE:INDEX:FINNIFTY',
      'NSE:INDEX:INDIAVIX',
      'BSE:INDEX:SENSEX',
      'BSE:INDEX:BANKEX',
    ]);
  });

  it('enables option chains for the five equity indexes only', () => {
    expect(OPTION_CHAIN_INSTRUMENT_KEYS).toHaveLength(5);
    expect(OPTION_CHAIN_INSTRUMENT_KEYS).not.toContain('NSE:INDEX:INDIAVIX');
    expect(catalogInstrument('NSE:INDEX:INDIAVIX')?.hasOptionChain).toBe(false);
    expect(catalogInstrument('NSE:INDEX:INDIAVIX')?.kind).toBe('VOLATILITY_INDEX');
  });

  it('returns null for unknown keys', () => {
    expect(catalogInstrument('NSE:INDEX:NOPE')).toBeNull();
  });
});
