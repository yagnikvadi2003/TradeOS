import { Injectable } from '@nestjs/common';
import {
  type InstrumentKey,
  isInstrumentKey,
  type IsoDate,
  isoDateToUtcDate,
  type OptionContractKey,
  toIsoDate,
} from '@/common/market/market-primitives';
import { type PrismaService } from '@/infrastructure/database/prisma.service';
import { type InstrumentDefinition } from '@/modules/instruments/instrument-definition';
import { type OptionContract } from '../domain';
import {
  type ExpiryUpsert,
  type OptionChainRepository,
  type StoredExpiry,
} from '../option-chain.repository';

/** The subset of the Prisma client this repository uses; keeps tests free of a database. */
export type OptionChainPrisma = Pick<
  PrismaService,
  'instrument' | 'expiry' | 'optionInstrument' | '$transaction'
>;

interface DecimalLike {
  toNumber(): number;
}

function num(value: DecimalLike | number | null): number | null {
  if (value === null) return null;
  return typeof value === 'number' ? value : value.toNumber();
}

/**
 * PostgreSQL-backed metadata repository. Every write is idempotent (upsert on
 * the natural unique key) so provider syncs can re-run safely. Decimal
 * columns are converted to JS numbers at this boundary.
 */
@Injectable()
export class PrismaOptionChainRepository implements OptionChainRepository {
  constructor(private readonly prisma: OptionChainPrisma) {}

  async findInstrument(instrumentKey: InstrumentKey): Promise<InstrumentDefinition | null> {
    const row = await this.prisma.instrument.findUnique({ where: { instrumentKey } });
    if (!row || !isInstrumentKey(row.instrumentKey)) return null;
    return {
      instrumentKey: row.instrumentKey,
      symbol: row.symbol,
      name: row.name,
      exchangeCode: row.exchangeCode,
      kind: row.kind,
      tickSize: num(row.tickSize) ?? 0.05,
      hasOptionChain: row.hasOptionChain,
      lotSize: row.lotSize,
      strikeStep: num(row.strikeStep),
    };
  }

  async upsertInstruments(instruments: readonly InstrumentDefinition[]): Promise<void> {
    for (const i of instruments) {
      const data = {
        symbol: i.symbol,
        name: i.name,
        exchangeCode: i.exchangeCode,
        kind: i.kind,
        tickSize: i.tickSize,
        hasOptionChain: i.hasOptionChain,
        lotSize: i.lotSize,
        strikeStep: i.strikeStep,
        isActive: true,
      };
      await this.prisma.instrument.upsert({
        where: { instrumentKey: i.instrumentKey },
        create: { instrumentKey: i.instrumentKey, ...data },
        update: data,
      });
    }
  }

  async findActiveExpiries(instrumentKey: InstrumentKey): Promise<readonly StoredExpiry[]> {
    const rows = await this.prisma.expiry.findMany({
      where: { isActive: true, instrument: { instrumentKey } },
      orderBy: { expiryDate: 'asc' },
      select: { expiryDate: true, cycle: true, isActive: true },
    });
    return rows.map((r) => ({
      instrumentKey,
      expiryDate: toIsoDate(r.expiryDate),
      cycle: r.cycle,
      isActive: r.isActive,
    }));
  }

  async syncExpiries(
    instrumentKey: InstrumentKey,
    expiries: readonly ExpiryUpsert[],
  ): Promise<readonly StoredExpiry[]> {
    const instrument = await this.prisma.instrument.findUnique({
      where: { instrumentKey },
      select: { id: true },
    });
    if (!instrument) return [];
    const dates = expiries.map((e) => isoDateToUtcDate(e.expiryDate));
    await this.prisma.$transaction([
      this.prisma.expiry.updateMany({
        where: { instrumentId: instrument.id, isActive: true, expiryDate: { notIn: dates } },
        data: { isActive: false },
      }),
      ...expiries.map((e) =>
        this.prisma.expiry.upsert({
          where: {
            instrumentId_expiryDate: {
              instrumentId: instrument.id,
              expiryDate: isoDateToUtcDate(e.expiryDate),
            },
          },
          create: {
            instrumentId: instrument.id,
            expiryDate: isoDateToUtcDate(e.expiryDate),
            cycle: e.cycle,
            isActive: true,
          },
          update: { cycle: e.cycle, isActive: true },
        }),
      ),
    ]);
    return this.findActiveExpiries(instrumentKey);
  }

  async findContracts(
    instrumentKey: InstrumentKey,
    expiryDate: IsoDate,
  ): Promise<readonly OptionContract[]> {
    const rows = await this.prisma.optionInstrument.findMany({
      where: {
        isActive: true,
        instrument: { instrumentKey },
        expiry: { expiryDate: isoDateToUtcDate(expiryDate) },
      },
      orderBy: [{ strike: 'asc' }, { optionType: 'asc' }],
    });
    return rows.map((r) => ({
      contractKey: r.contractKey as OptionContractKey,
      underlyingKey: instrumentKey,
      exchangeCode: r.exchangeCode,
      tradingSymbol: r.tradingSymbol,
      expiryDate,
      strike: num(r.strike) ?? 0,
      optionType: r.optionType,
      lotSize: r.lotSize,
      tickSize: num(r.tickSize) ?? 0.05,
    }));
  }

  async upsertContracts(contracts: readonly OptionContract[]): Promise<void> {
    if (contracts.length === 0) return;
    // Resolve parent ids once per (instrument, expiry) pair, not per contract.
    const parents = new Map<string, { instrumentId: string; expiryId: string }>();
    for (const c of contracts) {
      const key = `${c.underlyingKey}|${c.expiryDate}`;
      if (parents.has(key)) continue;
      const expiry = await this.prisma.expiry.findFirst({
        where: {
          expiryDate: isoDateToUtcDate(c.expiryDate),
          instrument: { instrumentKey: c.underlyingKey },
        },
        select: { id: true, instrumentId: true },
      });
      if (!expiry) continue;
      parents.set(key, { instrumentId: expiry.instrumentId, expiryId: expiry.id });
    }
    const writes = contracts.flatMap((c) => {
      const parent = parents.get(`${c.underlyingKey}|${c.expiryDate}`);
      if (!parent) return [];
      const data = {
        exchangeCode: c.exchangeCode,
        tradingSymbol: c.tradingSymbol,
        lotSize: c.lotSize,
        tickSize: c.tickSize,
        isActive: true,
      };
      return [
        this.prisma.optionInstrument.upsert({
          where: { contractKey: c.contractKey },
          create: {
            contractKey: c.contractKey,
            instrumentId: parent.instrumentId,
            expiryId: parent.expiryId,
            strike: c.strike,
            optionType: c.optionType,
            ...data,
          },
          update: data,
        }),
      ];
    });
    // Chunk to keep transactions bounded on small databases.
    for (let i = 0; i < writes.length; i += 100) {
      await this.prisma.$transaction(writes.slice(i, i + 100));
    }
  }
}
