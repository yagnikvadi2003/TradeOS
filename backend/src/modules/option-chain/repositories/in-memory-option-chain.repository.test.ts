import { describe, expect, it } from 'vitest';
import { buildOptionContractKey } from '@/common/market/market-primitives';
import { INSTRUMENT_CATALOG } from '@/modules/instruments/instrument.catalog';
import { type OptionContract } from '../domain';
import { InMemoryOptionChainRepository } from './in-memory-option-chain.repository';

const KEY = 'NSE:INDEX:NIFTY50' as const;

function contract(
  strike: number,
  optionType: 'CE' | 'PE',
  expiryDate = '2026-09-15',
): OptionContract {
  return {
    contractKey: buildOptionContractKey('NSE', 'NIFTY50', expiryDate, strike, optionType),
    underlyingKey: KEY,
    exchangeCode: 'NSE',
    tradingSymbol: `NIFTY${strike}${optionType}`,
    expiryDate,
    strike,
    optionType,
    lotSize: 75,
    tickSize: 0.05,
  };
}

describe('InMemoryOptionChainRepository', () => {
  it('serves the seeded catalog and honours capability flags', async () => {
    const repo = new InMemoryOptionChainRepository(INSTRUMENT_CATALOG);
    expect((await repo.findInstrument(KEY))?.hasOptionChain).toBe(true);
    expect((await repo.findInstrument('NSE:INDEX:INDIAVIX'))?.hasOptionChain).toBe(false);
    expect(await repo.findInstrument('NSE:INDEX:NOPE')).toBeNull();
  });

  it('syncExpiries upserts, deactivates missing rows and returns sorted active rows', async () => {
    const repo = new InMemoryOptionChainRepository(INSTRUMENT_CATALOG);
    await repo.syncExpiries(KEY, [
      { expiryDate: '2026-09-22', cycle: 'WEEKLY' },
      { expiryDate: '2026-09-15', cycle: 'WEEKLY' },
    ]);
    const next = await repo.syncExpiries(KEY, [
      { expiryDate: '2026-09-22', cycle: 'WEEKLY' },
      { expiryDate: '2026-09-29', cycle: 'MONTHLY' },
    ]);
    expect(next.map((e) => e.expiryDate)).toEqual(['2026-09-22', '2026-09-29']);
    expect(await repo.findActiveExpiries(KEY)).toEqual(next);
    // Re-listing a deactivated expiry reactivates it (idempotent upsert).
    const again = await repo.syncExpiries(KEY, [{ expiryDate: '2026-09-15', cycle: 'WEEKLY' }]);
    expect(again.map((e) => e.expiryDate)).toEqual(['2026-09-15']);
  });

  it('upsertContracts is idempotent on contractKey and scoped by expiry', async () => {
    const repo = new InMemoryOptionChainRepository(INSTRUMENT_CATALOG);
    const rows = [contract(24_050, 'PE'), contract(24_000, 'CE'), contract(24_000, 'PE')];
    await repo.upsertContracts(rows);
    await repo.upsertContracts([{ ...rows[1]!, tradingSymbol: 'RENAMED' }]);
    await repo.upsertContracts([contract(24_000, 'CE', '2026-09-22')]);
    const found = await repo.findContracts(KEY, '2026-09-15');
    expect(found.map((c) => [c.strike, c.optionType])).toEqual([
      [24_000, 'CE'],
      [24_000, 'PE'],
      [24_050, 'PE'],
    ]);
    expect(found[0]?.tradingSymbol).toBe('RENAMED');
    expect(await repo.findContracts(KEY, '2026-09-29')).toEqual([]);
  });
});
