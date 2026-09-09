import {
  type ExpiryCycle,
  type InstrumentKey,
  type IsoDate,
} from '@/common/market/market-primitives';
import { type InstrumentDefinition } from '@/modules/instruments/instrument-definition';
import { type OptionContract } from './domain';

/** Durable expiry row (no derived fields; `daysToExpiry` is computed in the service). */
export interface StoredExpiry {
  readonly instrumentKey: InstrumentKey;
  readonly expiryDate: IsoDate;
  readonly cycle: ExpiryCycle;
  readonly isActive: boolean;
}

export interface ExpiryUpsert {
  readonly expiryDate: IsoDate;
  readonly cycle: ExpiryCycle;
}

/**
 * Persistence port for option-chain metadata. PostgreSQL (Prisma) in
 * deployments; an in-memory implementation for single-instance development
 * without a database and for tests. Realtime market data never goes here.
 */
export interface OptionChainRepository {
  findInstrument(instrumentKey: InstrumentKey): Promise<InstrumentDefinition | null>;
  /** Idempotently ensure catalog instruments exist (seed / boot reconciliation). */
  upsertInstruments(instruments: readonly InstrumentDefinition[]): Promise<void>;

  findActiveExpiries(instrumentKey: InstrumentKey): Promise<readonly StoredExpiry[]>;
  /**
   * Replace the active expiry set: upsert `expiries`, deactivate any active
   * row not in the set. Returns the resulting active expiries sorted by date.
   */
  syncExpiries(
    instrumentKey: InstrumentKey,
    expiries: readonly ExpiryUpsert[],
  ): Promise<readonly StoredExpiry[]>;

  findContracts(
    instrumentKey: InstrumentKey,
    expiryDate: IsoDate,
  ): Promise<readonly OptionContract[]>;
  /** Idempotent bulk upsert of contract metadata for one expiry. */
  upsertContracts(contracts: readonly OptionContract[]): Promise<void>;
}

export const OPTION_CHAIN_REPOSITORY = Symbol('OPTION_CHAIN_REPOSITORY');
