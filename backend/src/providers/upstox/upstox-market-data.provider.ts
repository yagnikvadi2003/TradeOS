import {
  type InstrumentKey,
  type IsoDate,
  type OptionContractKey,
  parseOptionContractKey,
  istIsoDate,
} from '@/common/market/market-primitives';
import {
  InstrumentNotFoundError,
  OptionChainNotSupportedError,
} from '@/common/errors/domain-error';
import { type MarketStateStore } from '@/infrastructure/realtime/market-state.store';
import { catalogInstrument } from '@/modules/instruments/instrument.catalog';
import {
  CANDLE_INTERVAL_SECONDS,
  type Candle,
  type CandleInterval,
  type CandleSeries,
} from '@/modules/charts/domain/candle';
import {
  type OptionContract,
  type OptionMarketData,
  type UnderlyingMarketData,
} from '@/modules/option-chain/domain';
import { type MarketDataProvider, type ProviderExpiry } from '../provider.interface';
import {
  type UpstoxCandleRow,
  type UpstoxChainLeg,
  type UpstoxContract,
  type UpstoxRestClient,
} from './rest/upstox-rest.client';
import {
  contractKeyFrom,
  type MappedOption,
  UPSTOX_INDEX_KEYS,
  type UpstoxSymbolMap,
} from './mappers/upstox-symbol-map';

const CANDLE_UNITS: Record<CandleInterval, { unit: 'minutes' | 'hours' | 'days'; size: number }> = {
  '1m': { unit: 'minutes', size: 1 },
  '5m': { unit: 'minutes', size: 5 },
  '15m': { unit: 'minutes', size: 15 },
  '1h': { unit: 'hours', size: 1 },
  '1d': { unit: 'days', size: 1 },
};

function nn(value: number | undefined): number | null {
  return value !== undefined && Number.isFinite(value) && value >= 0 ? value : null;
}
function round(value: number, decimals = 2): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

/**
 * Snapshot side of the Upstox adapter (the `MarketDataProvider` port from
 * phase 2). Metadata comes from the option-contract API (one call per
 * underlying per refresh, never the multi-megabyte instrument master).
 * Market data is served from the live state store when the feed already
 * carries the contract; the option-chain REST endpoint is used only for
 * keys the feed has not warmed — so a cold snapshot costs one call, and a
 * warm one costs none.
 */
export class UpstoxMarketDataProvider implements MarketDataProvider {
  readonly name = 'upstox' as const;
  readonly dataSource = 'live' as const;
  private readonly contractsLoadedAt = new Map<InstrumentKey, number>();

  constructor(
    private readonly rest: UpstoxRestClient,
    private readonly symbols: UpstoxSymbolMap,
    private readonly liveState: MarketStateStore | null,
    private readonly now: () => number = () => Date.now(),
    private readonly contractsTtlMs = 6 * 60 * 60 * 1000,
  ) {}

  private underlyingUpstoxKey(instrumentKey: InstrumentKey): string {
    const definition = catalogInstrument(instrumentKey);
    if (!definition) throw new InstrumentNotFoundError(instrumentKey);
    if (!definition.hasOptionChain) throw new OptionChainNotSupportedError(instrumentKey);
    const key = UPSTOX_INDEX_KEYS[instrumentKey];
    if (!key) throw new OptionChainNotSupportedError(instrumentKey);
    return key;
  }

  /** Load (or reuse) every listed contract for an underlying into the symbol map. */
  async ensureContracts(instrumentKey: InstrumentKey): Promise<OptionContract[]> {
    const loadedAt = this.contractsLoadedAt.get(instrumentKey);
    if (loadedAt !== undefined && this.now() - loadedAt < this.contractsTtlMs) {
      return this.symbols.optionsFor(instrumentKey);
    }
    const upstoxKey = this.underlyingUpstoxKey(instrumentKey);
    const definition = catalogInstrument(instrumentKey)!;
    const rows = await this.rest.getOptionContracts(upstoxKey);
    const mapped: MappedOption[] = [];
    for (const row of rows) {
      const contract = toContract(row, instrumentKey, definition.symbol, definition.exchangeCode);
      if (contract)
        mapped.push({
          contract,
          upstoxKey: row.instrument_key,
          ...(row.weekly !== undefined ? { weekly: row.weekly } : {}),
        });
    }
    this.symbols.replaceOptions(instrumentKey, mapped);
    this.contractsLoadedAt.set(instrumentKey, this.now());
    return mapped.map((m) => m.contract);
  }

  async listExpiries(instrumentKey: InstrumentKey): Promise<readonly ProviderExpiry[]> {
    const contracts = await this.ensureContracts(instrumentKey);
    const byDate = new Map<IsoDate, ProviderExpiry>();
    for (const c of contracts) {
      if (!byDate.has(c.expiryDate)) {
        const weekly = this.symbols.option(c.contractKey)?.weekly;
        byDate.set(c.expiryDate, {
          expiryDate: c.expiryDate,
          cycle: weekly ? 'WEEKLY' : 'MONTHLY',
        });
      }
    }
    return [...byDate.values()].sort((a, b) => (a.expiryDate < b.expiryDate ? -1 : 1));
  }

  async listOptionContracts(
    instrumentKey: InstrumentKey,
    expiryDate: IsoDate,
  ): Promise<readonly OptionContract[]> {
    const contracts = await this.ensureContracts(instrumentKey);
    return contracts.filter((c) => c.expiryDate === expiryDate);
  }

  /**
   * History = V3 historical (past sessions, within the documented retrieval
   * window for the unit) + V3 intraday (current session), merged and
   * de-duplicated by bar time. Two calls per (instrument, interval) per cache
   * period; indexes carry no volume so it is omitted rather than reported as 0.
   */
  async getCandles(
    instrumentKey: InstrumentKey,
    interval: CandleInterval,
    count: number,
  ): Promise<CandleSeries> {
    const definition = catalogInstrument(instrumentKey);
    if (!definition) throw new InstrumentNotFoundError(instrumentKey);
    const upstoxKey = UPSTOX_INDEX_KEYS[instrumentKey];
    if (!upstoxKey) throw new InstrumentNotFoundError(instrumentKey);
    const { unit, size } = CANDLE_UNITS[interval];
    const today = istIsoDate(this.now());
    // Days of history needed: bars × seconds / (6.25 h session), bounded by Upstox's retrieval window.
    const sessionSeconds = 6.25 * 3_600;
    const barsPerDay =
      unit === 'days'
        ? 1
        : Math.max(1, Math.floor(sessionSeconds / CANDLE_INTERVAL_SECONDS[interval]));
    const calendarDays = Math.min(
      unit === 'days'
        ? Math.ceil((count / 250) * 365) + 7
        : Math.ceil((count / barsPerDay) * 1.6) + 3,
      unit === 'minutes' && size <= 15 ? 30 : unit === 'days' ? 3_650 : 90,
    );
    const from = istIsoDate(this.now() - calendarDays * 86_400_000);
    const rows: UpstoxCandleRow[] = [];
    const settled = await Promise.allSettled([
      this.rest.getHistoricalCandles(upstoxKey, unit, size, today, from),
      unit === 'days'
        ? Promise.resolve([] as UpstoxCandleRow[])
        : this.rest.getIntradayCandles(upstoxKey, unit, size),
    ]);
    for (const result of settled) if (result.status === 'fulfilled') rows.push(...result.value);
    if (settled.every((r) => r.status === 'rejected'))
      throw (settled[0] as PromiseRejectedResult).reason as Error;
    const byTime = new Map<number, Candle>();
    for (const row of rows) {
      const time = Math.floor(Date.parse(row[0]) / 1000);
      if (!Number.isFinite(time)) continue;
      const candle: Candle = { time, open: row[1], high: row[2], low: row[3], close: row[4] };
      byTime.set(time, row[5] > 0 ? { ...candle, volume: row[5] } : candle);
    }
    const candles = [...byTime.values()].sort((a, b) => a.time - b.time).slice(-count);
    return { instrumentKey, interval, candles, source: 'snapshot' };
  }

  async getUnderlyingQuote(instrumentKey: InstrumentKey): Promise<UnderlyingMarketData> {
    const definition = catalogInstrument(instrumentKey);
    if (!definition) throw new InstrumentNotFoundError(instrumentKey);
    const live = this.liveState?.get(instrumentKey);
    if (live?.kind === 'index' && live.ltp !== null && live.previousClose !== null) {
      return {
        instrumentKey,
        ltp: live.ltp,
        previousClose: live.previousClose,
        open: live.open ?? live.ltp,
        high: live.high ?? live.ltp,
        low: live.low ?? live.ltp,
        change: live.change ?? round(live.ltp - live.previousClose),
        changePercent:
          live.changePercent ?? round(((live.ltp - live.previousClose) / live.previousClose) * 100),
        updatedAt: live.timestamp,
        source: 'live',
      };
    }
    const quote = await this.rest.getOhlcQuote(UPSTOX_INDEX_KEYS[instrumentKey]!);
    const ltp = quote?.last_price ?? quote?.live_ohlc?.close;
    const previousClose = quote?.prev_ohlc?.close;
    if (!ltp || !previousClose) throw new InstrumentNotFoundError(instrumentKey);
    const change = round(ltp - previousClose);
    return {
      instrumentKey,
      ltp,
      previousClose,
      open: quote?.live_ohlc?.open ?? ltp,
      high: quote?.live_ohlc?.high ?? ltp,
      low: quote?.live_ohlc?.low ?? ltp,
      change,
      changePercent: round((change / previousClose) * 100),
      updatedAt: this.now(),
      source: 'snapshot',
    };
  }

  async getOptionMarketData(
    contractKeys: readonly OptionContractKey[],
  ): Promise<readonly OptionMarketData[]> {
    const out: OptionMarketData[] = [];
    const cold = new Map<string, OptionContractKey[]>(); // `${underlying}|${expiry}` → keys
    for (const key of contractKeys) {
      const live = this.liveState?.get(key);
      if (live?.kind === 'option' && live.ltp !== null) {
        out.push({
          contractKey: key,
          ltp: live.ltp,
          previousClose: live.previousClose,
          change: live.change,
          changePercent: live.changePercent,
          volume: live.volume,
          openInterest: live.openInterest,
          openInterestChange: live.openInterestChange,
          impliedVolatility: live.impliedVolatility,
          bid: live.bid,
          ask: live.ask,
          bidQuantity: live.bidQuantity,
          askQuantity: live.askQuantity,
          greeks: live.greeks,
          updatedAt: live.timestamp,
          source: 'live',
        });
        continue;
      }
      const parsed = parseOptionContractKey(key);
      if (!parsed) continue;
      const group = `${parsed.exchangeCode}:INDEX:${parsed.underlyingSymbol}|${parsed.expiryDate}`;
      const list = cold.get(group) ?? [];
      list.push(key);
      cold.set(group, list);
    }
    for (const [group, keys] of cold) {
      const [underlyingKey, expiryDate] = group.split('|') as [InstrumentKey, IsoDate];
      const wanted = new Set<string>(keys);
      const rows = await this.rest.getOptionChain(
        this.underlyingUpstoxKey(underlyingKey),
        expiryDate,
      );
      const at = this.now();
      for (const row of rows) {
        for (const leg of [row.call_options, row.put_options]) {
          if (!leg) continue;
          const tradeOsKey = this.symbols.tradeOsKeyFor(leg.instrument_key);
          if (!tradeOsKey || !wanted.has(tradeOsKey)) continue;
          out.push(fromChainLeg(tradeOsKey as OptionContractKey, leg, at));
        }
      }
    }
    return out;
  }
}

function toContract(
  row: UpstoxContract,
  underlyingKey: InstrumentKey,
  symbol: string,
  exchangeCode: 'NSE' | 'BSE',
): OptionContract | null {
  if (row.exchange !== exchangeCode) return null;
  return {
    contractKey: contractKeyFrom(
      exchangeCode,
      symbol,
      row.expiry,
      row.strike_price,
      row.instrument_type,
    ),
    underlyingKey,
    exchangeCode,
    tradingSymbol: row.trading_symbol,
    expiryDate: row.expiry,
    strike: row.strike_price,
    optionType: row.instrument_type,
    lotSize: row.lot_size,
    // The contract API reports tick size in paise (5 → ₹0.05).
    tickSize: row.tick_size >= 1 ? row.tick_size / 100 : row.tick_size,
  };
}

function fromChainLeg(
  contractKey: OptionContractKey,
  leg: UpstoxChainLeg,
  at: number,
): OptionMarketData {
  const m = leg.market_data;
  const g = leg.option_greeks;
  const ltp = nn(m?.ltp);
  const previousClose = nn(m?.close_price);
  const change = ltp !== null && previousClose !== null ? round(ltp - previousClose) : null;
  const oi = nn(m?.oi);
  const prevOi = nn(m?.prev_oi);
  return {
    contractKey,
    ltp,
    previousClose,
    change,
    changePercent: change !== null && previousClose ? round((change / previousClose) * 100) : null,
    volume: nn(m?.volume),
    openInterest: oi,
    openInterestChange: oi !== null && prevOi !== null ? oi - prevOi : null,
    impliedVolatility: nn(g?.iv),
    bid: nn(m?.bid_price),
    ask: nn(m?.ask_price),
    bidQuantity: nn(m?.bid_qty),
    askQuantity: nn(m?.ask_qty),
    greeks:
      g?.delta !== undefined
        ? {
            delta: Math.max(-1, Math.min(1, g.delta)),
            gamma: g.gamma ?? 0,
            theta: g.theta ?? 0,
            vega: g.vega ?? 0,
          }
        : null,
    updatedAt: at,
    source: 'snapshot',
  };
}
