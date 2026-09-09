import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { z } from 'zod';
import { APP_ENV, type AppEnv } from '@/common/config/env';
import {
  DomainError,
  ExpiryNotFoundError,
  InstrumentNotFoundError,
  OptionChainNotSupportedError,
  ProviderPayloadInvalidError,
  ProviderUnavailableError,
} from '@/common/errors/domain-error';
import {
  type InstrumentKey,
  type IsoDate,
  isoDateToUtcDate,
  istIsoDate,
} from '@/common/market/market-primitives';
import { CACHE_STORE, type CacheStore } from '@/infrastructure/cache/cache-store.interface';
import { INSTRUMENT_CATALOG } from '@/modules/instruments/instrument.catalog';
import { type InstrumentDefinition } from '@/modules/instruments/instrument-definition';
import { MARKET_DATA_PROVIDER, type MarketDataProvider } from '@/providers/provider.interface';
import {
  providerExpirySchema,
  providerOptionContractSchema,
  providerOptionMarketDataSchema,
  providerUnderlyingSchema,
} from '@/providers/provider.schemas';
import {
  type Expiry,
  type OptionChainMetadata,
  type OptionChainSnapshot,
  type OptionContract,
  type OptionMarketData,
  type UnderlyingMarketData,
} from './domain';
import { assembleOptionChain } from './option-chain.assembler';
import {
  OPTION_CHAIN_REPOSITORY,
  type OptionChainRepository,
  type StoredExpiry,
} from './option-chain.repository';

export const CLOCK = Symbol('CLOCK');
export type Clock = () => number;

const DAY_MS = 24 * 60 * 60 * 1000;

interface OptionChainInstrument extends InstrumentDefinition {
  readonly lotSize: number;
  readonly strikeStep: number;
}

/**
 * Option-chain use cases.
 *
 * Metadata (expiries, contracts) is durable: repository first, provider on a
 * miss or after `OPTION_METADATA_TTL_SECONDS`, then persisted. Market data is
 * ephemeral: fetched from the provider per snapshot, coalesced across
 * concurrent callers and held in the realtime state layer for a couple of
 * seconds so a burst of requests costs one provider round-trip. Nothing
 * realtime is written to PostgreSQL.
 */
@Injectable()
export class OptionChainService implements OnModuleInit {
  private readonly inflight = new Map<string, Promise<OptionChainSnapshot>>();

  constructor(
    @Inject(OPTION_CHAIN_REPOSITORY) private readonly repository: OptionChainRepository,
    @Inject(MARKET_DATA_PROVIDER) private readonly provider: MarketDataProvider,
    @Inject(CACHE_STORE) private readonly cache: CacheStore,
    @Inject(APP_ENV) private readonly env: AppEnv,
    @Inject(CLOCK) private readonly now: Clock,
    private readonly logger: Logger,
  ) {}

  /** Reconcile the static catalog into the durable store so lookups never depend on a seed step. */
  async onModuleInit(): Promise<void> {
    try {
      await this.repository.upsertInstruments(INSTRUMENT_CATALOG);
    } catch (error) {
      this.logger.error({ err: error }, 'instrument catalog reconciliation failed');
    }
  }

  async getMetadata(instrumentKey: InstrumentKey): Promise<OptionChainMetadata> {
    const instrument = await this.resolveInstrument(instrumentKey);
    const expiries = await this.ensureExpiries(instrument);
    return {
      instrumentKey: instrument.instrumentKey,
      symbol: instrument.symbol,
      name: instrument.name,
      strikeStep: instrument.strikeStep,
      lotSize: instrument.lotSize,
      expiries,
      nearestExpiry: expiries[0]?.expiryDate ?? null,
    };
  }

  async getExpiries(instrumentKey: InstrumentKey): Promise<readonly Expiry[]> {
    const instrument = await this.resolveInstrument(instrumentKey);
    return this.ensureExpiries(instrument);
  }

  async getSnapshot(
    instrumentKey: InstrumentKey,
    expiryDate?: IsoDate,
  ): Promise<OptionChainSnapshot> {
    const instrument = await this.resolveInstrument(instrumentKey);
    const expiries = await this.ensureExpiries(instrument);
    const expiry = expiryDate ? expiries.find((e) => e.expiryDate === expiryDate) : expiries[0];
    if (!expiry) {
      throw new ExpiryNotFoundError(instrumentKey, expiryDate ?? '(none listed)');
    }

    const cacheKey = `oc:snapshot:${instrumentKey}:${expiry.expiryDate}`;
    const cached = await this.cache.get<OptionChainSnapshot>(cacheKey);
    if (cached) return cached;

    const pending = this.inflight.get(cacheKey);
    if (pending) return pending;

    const work = this.buildSnapshot(instrument, expiry)
      .then(async (snapshot) => {
        await this.cache.set(
          cacheKey,
          snapshot,
          this.env.OPTION_CHAIN_SNAPSHOT_TTL_SECONDS * 1_000,
        );
        return snapshot;
      })
      .finally(() => this.inflight.delete(cacheKey));
    this.inflight.set(cacheKey, work);
    return work;
  }

  /* --------------------------------------------------------------------- */

  private async resolveInstrument(instrumentKey: InstrumentKey): Promise<OptionChainInstrument> {
    const instrument = await this.repository.findInstrument(instrumentKey);
    if (!instrument) throw new InstrumentNotFoundError(instrumentKey);
    if (
      !instrument.hasOptionChain ||
      instrument.lotSize === null ||
      instrument.strikeStep === null
    ) {
      throw new OptionChainNotSupportedError(instrumentKey);
    }
    return { ...instrument, lotSize: instrument.lotSize, strikeStep: instrument.strikeStep };
  }

  private async ensureExpiries(instrument: OptionChainInstrument): Promise<readonly Expiry[]> {
    const memoKey = `oc:expiries:${instrument.instrumentKey}`;
    const memo = await this.cache.get<readonly StoredExpiry[]>(memoKey);
    const today = istIsoDate(this.now());
    let stored: readonly StoredExpiry[];
    if (memo) {
      stored = memo;
    } else {
      stored = await this.repository.findActiveExpiries(instrument.instrumentKey);
      // Refresh when nothing is stored or the nearest stored expiry has lapsed.
      const stale = stored.length === 0 || stored.every((e) => e.expiryDate < today);
      if (stale) {
        const fromProvider = await this.callProvider(() =>
          this.provider.listExpiries(instrument.instrumentKey),
        );
        const parsed = this.validate(z.array(providerExpirySchema), fromProvider, 'expiries');
        stored = await this.repository.syncExpiries(instrument.instrumentKey, parsed);
      }
      await this.cache.set(memoKey, stored, this.env.OPTION_METADATA_TTL_SECONDS * 1_000);
    }
    return stored
      .filter((e) => e.isActive && e.expiryDate >= today)
      .map((e) => ({
        instrumentKey: e.instrumentKey,
        expiryDate: e.expiryDate,
        cycle: e.cycle,
        daysToExpiry: daysBetween(today, e.expiryDate),
        isActive: e.isActive,
      }));
  }

  private async ensureContracts(
    instrument: OptionChainInstrument,
    expiryDate: IsoDate,
  ): Promise<readonly OptionContract[]> {
    const memoKey = `oc:contracts:${instrument.instrumentKey}:${expiryDate}`;
    const memo = await this.cache.get<readonly OptionContract[]>(memoKey);
    if (memo) return memo;
    let contracts = await this.repository.findContracts(instrument.instrumentKey, expiryDate);
    if (contracts.length === 0) {
      const fromProvider = await this.callProvider(() =>
        this.provider.listOptionContracts(instrument.instrumentKey, expiryDate),
      );
      contracts = this.validate(z.array(providerOptionContractSchema), fromProvider, 'contracts');
      await this.repository.upsertContracts(contracts);
    }
    await this.cache.set(memoKey, contracts, this.env.OPTION_METADATA_TTL_SECONDS * 1_000);
    return contracts;
  }

  private async buildSnapshot(
    instrument: OptionChainInstrument,
    expiry: Expiry,
  ): Promise<OptionChainSnapshot> {
    const contracts = await this.ensureContracts(instrument, expiry.expiryDate);
    const [underlyingRaw, marketRaw] = await this.callProvider(() =>
      Promise.all([
        this.provider.getUnderlyingQuote(instrument.instrumentKey),
        this.provider.getOptionMarketData(contracts.map((c) => c.contractKey)),
      ]),
    );
    const underlying = this.validate(providerUnderlyingSchema, underlyingRaw, 'underlying');
    const marketData = this.validateRows(marketRaw);
    return assembleOptionChain({
      instrumentKey: instrument.instrumentKey,
      expiry,
      underlying,
      contracts,
      marketData,
      strikeStep: instrument.strikeStep,
      lotSize: instrument.lotSize,
      asOf: this.now(),
    });
  }

  private async callProvider<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof DomainError) throw error;
      this.logger.warn({ err: error, provider: this.provider.name }, 'provider call failed');
      throw new ProviderUnavailableError(this.provider.name, error);
    }
  }

  private validate<T>(schema: z.ZodType<T>, value: unknown, what: string): T {
    const result = schema.safeParse(value);
    if (result.success) return result.data;
    this.logger.warn(
      { provider: this.provider.name, what, issues: result.error.issues.length },
      'provider payload rejected',
    );
    throw new ProviderPayloadInvalidError(
      this.provider.name,
      `${what}: ${result.error.issues[0]?.message ?? 'invalid'}`,
    );
  }

  /**
   * Market rows are validated individually: one malformed contract row is
   * dropped (and counted) rather than failing the whole chain.
   */
  private validateRows(rows: readonly unknown[]): OptionMarketData[] {
    const valid: OptionMarketData[] = [];
    let dropped = 0;
    for (const row of rows) {
      const result = providerOptionMarketDataSchema.safeParse(row);
      if (result.success) valid.push(result.data);
      else dropped += 1;
    }
    if (dropped > 0) {
      this.logger.warn({ provider: this.provider.name, dropped }, 'malformed option rows dropped');
    }
    return valid;
  }
}

function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((isoDateToUtcDate(to).getTime() - isoDateToUtcDate(from).getTime()) / DAY_MS);
}

export type { UnderlyingMarketData };
