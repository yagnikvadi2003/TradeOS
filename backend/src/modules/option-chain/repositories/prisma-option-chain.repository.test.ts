import { describe, expect, it, vi } from 'vitest';
import { buildOptionContractKey } from '@/common/market/market-primitives';
import { type OptionContract } from '../domain';
import {
  type OptionChainPrisma,
  PrismaOptionChainRepository,
} from './prisma-option-chain.repository';

/**
 * Exercises the Prisma repository against a typed fake client: verifies the
 * query shapes, Decimal → number conversion, date handling and transaction
 * batching without needing PostgreSQL in the test environment.
 */
class FakeDecimal {
  constructor(private readonly value: number) {}
  toNumber(): number {
    return this.value;
  }
}

function fakePrisma() {
  const instrument = {
    findUnique: vi.fn(),
    upsert: vi.fn(),
  };
  const expiry = {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    updateMany: vi.fn((args: unknown) => ({ op: 'updateMany', args })),
    upsert: vi.fn((args: unknown) => ({ op: 'upsert', args })),
  };
  const optionInstrument = {
    findMany: vi.fn(),
    upsert: vi.fn((args: unknown) => ({ op: 'upsert', args })),
  };
  const $transaction = vi.fn(async (ops: unknown[]) => ops);
  const client = {
    instrument,
    expiry,
    optionInstrument,
    $transaction,
  } as unknown as OptionChainPrisma;
  return { client, instrument, expiry, optionInstrument, $transaction };
}

describe('PrismaOptionChainRepository', () => {
  it('maps an instrument row, converting Decimal columns', async () => {
    const { client, instrument } = fakePrisma();
    instrument.findUnique.mockResolvedValue({
      instrumentKey: 'NSE:INDEX:NIFTY50',
      symbol: 'NIFTY50',
      name: 'Nifty 50',
      exchangeCode: 'NSE',
      kind: 'EQUITY_INDEX',
      tickSize: new FakeDecimal(0.05),
      hasOptionChain: true,
      lotSize: 75,
      strikeStep: new FakeDecimal(50),
    });
    const repo = new PrismaOptionChainRepository(client);
    const found = await repo.findInstrument('NSE:INDEX:NIFTY50');
    expect(found).toEqual({
      instrumentKey: 'NSE:INDEX:NIFTY50',
      symbol: 'NIFTY50',
      name: 'Nifty 50',
      exchangeCode: 'NSE',
      kind: 'EQUITY_INDEX',
      tickSize: 0.05,
      hasOptionChain: true,
      lotSize: 75,
      strikeStep: 50,
    });
    expect(instrument.findUnique).toHaveBeenCalledWith({
      where: { instrumentKey: 'NSE:INDEX:NIFTY50' },
    });
  });

  it('reads active expiries as ISO dates', async () => {
    const { client, expiry } = fakePrisma();
    expiry.findMany.mockResolvedValue([
      { expiryDate: new Date('2026-09-15T00:00:00.000Z'), cycle: 'WEEKLY', isActive: true },
    ]);
    const repo = new PrismaOptionChainRepository(client);
    expect(await repo.findActiveExpiries('NSE:INDEX:NIFTY50')).toEqual([
      {
        instrumentKey: 'NSE:INDEX:NIFTY50',
        expiryDate: '2026-09-15',
        cycle: 'WEEKLY',
        isActive: true,
      },
    ]);
    expect(expiry.findMany.mock.calls[0]?.[0]).toMatchObject({
      where: { isActive: true, instrument: { instrumentKey: 'NSE:INDEX:NIFTY50' } },
      orderBy: { expiryDate: 'asc' },
    });
  });

  it('syncExpiries deactivates absent rows and upserts listed ones in one transaction', async () => {
    const { client, instrument, expiry, $transaction } = fakePrisma();
    instrument.findUnique.mockResolvedValue({ id: 'inst-1' });
    expiry.findMany.mockResolvedValue([]);
    const repo = new PrismaOptionChainRepository(client);
    await repo.syncExpiries('NSE:INDEX:NIFTY50', [
      { expiryDate: '2026-09-15', cycle: 'WEEKLY' },
      { expiryDate: '2026-09-29', cycle: 'MONTHLY' },
    ]);
    expect($transaction).toHaveBeenCalledTimes(1);
    const ops = $transaction.mock.calls[0]?.[0] as { op: string; args: unknown }[];
    expect(ops.map((o) => o.op)).toEqual(['updateMany', 'upsert', 'upsert']);
    expect(ops[0]?.args).toMatchObject({
      where: {
        instrumentId: 'inst-1',
        isActive: true,
        expiryDate: { notIn: [new Date('2026-09-15T00:00:00Z'), new Date('2026-09-29T00:00:00Z')] },
      },
      data: { isActive: false },
    });
    expect(ops[1]?.args).toMatchObject({
      where: {
        instrumentId_expiryDate: {
          instrumentId: 'inst-1',
          expiryDate: new Date('2026-09-15T00:00:00Z'),
        },
      },
      create: { cycle: 'WEEKLY', isActive: true },
    });
  });

  it('returns nothing when syncing an unknown instrument', async () => {
    const { client, instrument, $transaction } = fakePrisma();
    instrument.findUnique.mockResolvedValue(null);
    const repo = new PrismaOptionChainRepository(client);
    expect(await repo.syncExpiries('NSE:INDEX:NOPE', [])).toEqual([]);
    expect($transaction).not.toHaveBeenCalled();
  });

  it('maps contract rows and batches upserts in chunks of 100', async () => {
    const { client, expiry, optionInstrument, $transaction } = fakePrisma();
    expiry.findFirst.mockResolvedValue({ id: 'exp-1', instrumentId: 'inst-1' });
    optionInstrument.findMany.mockResolvedValue([
      {
        contractKey: 'NSE:OPT:NIFTY50:2026-09-15:24000:CE',
        exchangeCode: 'NSE',
        tradingSymbol: 'NIFTY24000CE',
        strike: new FakeDecimal(24_000),
        optionType: 'CE',
        lotSize: 75,
        tickSize: new FakeDecimal(0.05),
      },
    ]);
    const repo = new PrismaOptionChainRepository(client);
    const found = await repo.findContracts('NSE:INDEX:NIFTY50', '2026-09-15');
    expect(found[0]).toMatchObject({
      strike: 24_000,
      tickSize: 0.05,
      expiryDate: '2026-09-15',
      underlyingKey: 'NSE:INDEX:NIFTY50',
    });

    const contracts: OptionContract[] = Array.from({ length: 150 }, (_, i) => ({
      contractKey: buildOptionContractKey('NSE', 'NIFTY50', '2026-09-15', 20_000 + i * 50, 'CE'),
      underlyingKey: 'NSE:INDEX:NIFTY50',
      exchangeCode: 'NSE',
      tradingSymbol: `C${i}`,
      expiryDate: '2026-09-15',
      strike: 20_000 + i * 50,
      optionType: 'CE',
      lotSize: 75,
      tickSize: 0.05,
    }));
    await repo.upsertContracts(contracts);
    expect(expiry.findFirst).toHaveBeenCalledTimes(1); // parent resolved once per (instrument, expiry)
    expect($transaction).toHaveBeenCalledTimes(2);
    expect($transaction.mock.calls[0]![0]).toHaveLength(100);
    expect($transaction.mock.calls[1]![0]).toHaveLength(50);
    expect(optionInstrument.upsert.mock.calls[0]?.[0]).toMatchObject({
      where: { contractKey: contracts[0]!.contractKey },
      create: { instrumentId: 'inst-1', expiryId: 'exp-1', strike: 20_000, optionType: 'CE' },
    });
  });
});
