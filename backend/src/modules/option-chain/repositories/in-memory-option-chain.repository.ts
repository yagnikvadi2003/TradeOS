import { Injectable } from '@nestjs/common';
import { type InstrumentKey, type IsoDate } from '@/common/market/market-primitives';
import { type InstrumentDefinition } from '@/modules/instruments/instrument-definition';
import { type OptionContract } from '../domain';
import {
  type ExpiryUpsert,
  type OptionChainRepository,
  type StoredExpiry,
} from '../option-chain.repository';

/**
 * Map-backed repository. Used when `DATABASE_URL` is absent in development
 * (single-instance, free-tier) and in tests. Semantics mirror the Prisma
 * implementation, including unique-key behaviour.
 */
@Injectable()
export class InMemoryOptionChainRepository implements OptionChainRepository {
  private readonly instruments = new Map<InstrumentKey, InstrumentDefinition>();
  /** instrumentKey → expiryDate → row */
  private readonly expiries = new Map<InstrumentKey, Map<IsoDate, StoredExpiry>>();
  /** `${instrumentKey}|${expiryDate}` → contractKey → contract */
  private readonly contracts = new Map<string, Map<string, OptionContract>>();

  constructor(seed: readonly InstrumentDefinition[] = []) {
    for (const instrument of seed) this.instruments.set(instrument.instrumentKey, instrument);
  }

  async findInstrument(instrumentKey: InstrumentKey): Promise<InstrumentDefinition | null> {
    return this.instruments.get(instrumentKey) ?? null;
  }

  async upsertInstruments(instruments: readonly InstrumentDefinition[]): Promise<void> {
    for (const instrument of instruments)
      this.instruments.set(instrument.instrumentKey, instrument);
  }

  async findActiveExpiries(instrumentKey: InstrumentKey): Promise<readonly StoredExpiry[]> {
    const rows = this.expiries.get(instrumentKey);
    if (!rows) return [];
    return [...rows.values()].filter((e) => e.isActive).sort(byExpiryDate);
  }

  async syncExpiries(
    instrumentKey: InstrumentKey,
    expiries: readonly ExpiryUpsert[],
  ): Promise<readonly StoredExpiry[]> {
    let rows = this.expiries.get(instrumentKey);
    if (!rows) {
      rows = new Map();
      this.expiries.set(instrumentKey, rows);
    }
    const keep = new Set(expiries.map((e) => e.expiryDate));
    for (const [date, row] of rows) {
      if (!keep.has(date) && row.isActive) rows.set(date, { ...row, isActive: false });
    }
    for (const expiry of expiries) {
      rows.set(expiry.expiryDate, {
        instrumentKey,
        expiryDate: expiry.expiryDate,
        cycle: expiry.cycle,
        isActive: true,
      });
    }
    return this.findActiveExpiries(instrumentKey);
  }

  async findContracts(
    instrumentKey: InstrumentKey,
    expiryDate: IsoDate,
  ): Promise<readonly OptionContract[]> {
    const rows = this.contracts.get(`${instrumentKey}|${expiryDate}`);
    return rows ? [...rows.values()].sort(byStrikeThenType) : [];
  }

  async upsertContracts(contracts: readonly OptionContract[]): Promise<void> {
    for (const contract of contracts) {
      const bucket = `${contract.underlyingKey}|${contract.expiryDate}`;
      let rows = this.contracts.get(bucket);
      if (!rows) {
        rows = new Map();
        this.contracts.set(bucket, rows);
      }
      rows.set(contract.contractKey, contract);
    }
  }
}

function byExpiryDate(a: StoredExpiry, b: StoredExpiry): number {
  return a.expiryDate < b.expiryDate ? -1 : a.expiryDate > b.expiryDate ? 1 : 0;
}

export function byStrikeThenType(a: OptionContract, b: OptionContract): number {
  if (a.strike !== b.strike) return a.strike - b.strike;
  return a.optionType === b.optionType ? 0 : a.optionType === 'CE' ? -1 : 1;
}
