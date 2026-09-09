import {
  type ExchangeCode,
  type InstrumentKey,
  type InstrumentKind,
} from '@/common/market/market-primitives';

/**
 * Underlying instrument as the domain sees it. Persisted in `instruments`;
 * seeded from the catalog and refreshed from the provider instrument master
 * (lot size, strike step) once the Upstox adapter lands.
 */
export interface InstrumentDefinition {
  readonly instrumentKey: InstrumentKey;
  readonly symbol: string;
  readonly name: string;
  readonly exchangeCode: ExchangeCode;
  readonly kind: InstrumentKind;
  readonly tickSize: number;
  readonly hasOptionChain: boolean;
  /** Present only when `hasOptionChain` is true. */
  readonly lotSize: number | null;
  readonly strikeStep: number | null;
}
