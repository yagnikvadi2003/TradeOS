import {
  buildOptionContractKey,
  type ExchangeCode,
  type InstrumentKey,
  type IsoDate,
  type OptionContractKey,
  type OptionType,
} from '@/common/market/market-primitives';
import { type OptionContract } from '@/modules/option-chain/domain';

/** Upstox `SEGMENT|identifier` key. */
export type UpstoxKey = string;

/**
 * Static index mapping (verified against the Upstox V3 feed docs and the BOD
 * instrument file). Option contracts are added dynamically from the
 * instrument master, keyed by TradeOS contract key.
 */
export const UPSTOX_INDEX_KEYS: Readonly<Record<InstrumentKey, UpstoxKey>> = {
  'NSE:INDEX:NIFTY50': 'NSE_INDEX|Nifty 50',
  'NSE:INDEX:BANKNIFTY': 'NSE_INDEX|Nifty Bank',
  'NSE:INDEX:FINNIFTY': 'NSE_INDEX|Nifty Fin Service',
  'NSE:INDEX:INDIAVIX': 'NSE_INDEX|India VIX',
  'BSE:INDEX:SENSEX': 'BSE_INDEX|SENSEX',
  'BSE:INDEX:BANKEX': 'BSE_INDEX|BANKEX',
};

export interface MappedOption {
  readonly contract: OptionContract;
  readonly upstoxKey: UpstoxKey;
  readonly weekly?: boolean;
}

/**
 * Bidirectional symbol map. O(1) both ways; the feed normalizer resolves
 * every incoming Upstox key here and drops anything unknown.
 */
export class UpstoxSymbolMap {
  private readonly toUpstox = new Map<string, UpstoxKey>();
  private readonly toTradeOs = new Map<UpstoxKey, string>();
  private readonly options = new Map<OptionContractKey, MappedOption>();

  constructor() {
    for (const [tradeOsKey, upstoxKey] of Object.entries(UPSTOX_INDEX_KEYS)) {
      this.toUpstox.set(tradeOsKey, upstoxKey);
      this.toTradeOs.set(upstoxKey, tradeOsKey);
    }
  }

  registerOption(contract: OptionContract, upstoxKey: UpstoxKey, weekly?: boolean): void {
    this.options.set(contract.contractKey, {
      contract,
      upstoxKey,
      ...(weekly !== undefined ? { weekly } : {}),
    });
    this.toUpstox.set(contract.contractKey, upstoxKey);
    this.toTradeOs.set(upstoxKey, contract.contractKey);
  }

  /** Replace every option mapping for an underlying (daily instrument-master refresh). */
  replaceOptions(underlyingKey: InstrumentKey, mapped: readonly MappedOption[]): void {
    for (const [key, entry] of this.options) {
      if (entry.contract.underlyingKey !== underlyingKey) continue;
      this.options.delete(key);
      this.toUpstox.delete(key);
      this.toTradeOs.delete(entry.upstoxKey);
    }
    for (const m of mapped) this.registerOption(m.contract, m.upstoxKey, m.weekly);
  }

  upstoxKeyFor(tradeOsKey: string): UpstoxKey | undefined {
    return this.toUpstox.get(tradeOsKey);
  }

  tradeOsKeyFor(upstoxKey: UpstoxKey): string | undefined {
    return this.toTradeOs.get(upstoxKey);
  }

  option(contractKey: OptionContractKey): MappedOption | undefined {
    return this.options.get(contractKey);
  }

  optionsFor(underlyingKey: InstrumentKey, expiryDate?: IsoDate): OptionContract[] {
    const out: OptionContract[] = [];
    for (const { contract } of this.options.values()) {
      if (contract.underlyingKey !== underlyingKey) continue;
      if (expiryDate && contract.expiryDate !== expiryDate) continue;
      out.push(contract);
    }
    return out;
  }

  get optionCount(): number {
    return this.options.size;
  }
}

export function contractKeyFrom(
  exchangeCode: ExchangeCode,
  symbol: string,
  expiryDate: IsoDate,
  strike: number,
  optionType: OptionType,
): OptionContractKey {
  return buildOptionContractKey(exchangeCode, symbol, expiryDate, strike, optionType);
}
