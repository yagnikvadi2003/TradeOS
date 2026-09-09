/**
 * Provider-agnostic market primitives shared across modules. These mirror the
 * frontend domain vocabulary (exchange codes, instrument keys) and never
 * encode any provider's symbology.
 */
export const EXCHANGE_CODES = ['NSE', 'BSE'] as const;
export type ExchangeCode = (typeof EXCHANGE_CODES)[number];

export const INSTRUMENT_SEGMENTS = ['INDEX', 'OPTION'] as const;
export type InstrumentSegment = (typeof INSTRUMENT_SEGMENTS)[number];

export type InstrumentKind = 'EQUITY_INDEX' | 'VOLATILITY_INDEX';

export const OPTION_TYPES = ['CE', 'PE'] as const;
export type OptionType = (typeof OPTION_TYPES)[number];

export const EXPIRY_CYCLES = ['WEEKLY', 'MONTHLY', 'QUARTERLY'] as const;
export type ExpiryCycle = (typeof EXPIRY_CYCLES)[number];

/** `NSE:INDEX:NIFTY50` — TradeOS-owned identifier of an underlying. */
export type InstrumentKey = `${ExchangeCode}:INDEX:${string}`;

/** `NSE:OPT:NIFTY50:2026-09-16:24000:CE` — TradeOS-owned identifier of an option contract. */
export type OptionContractKey = `${ExchangeCode}:OPT:${string}:${string}:${string}:${OptionType}`;

/** ISO calendar date (`YYYY-MM-DD`) in the exchange timezone (IST). */
export type IsoDate = string;

export const INSTRUMENT_KEY_PATTERN = /^(NSE|BSE):INDEX:[A-Z0-9]{1,32}$/;
export const ISO_DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
export const OPTION_CONTRACT_KEY_PATTERN =
  /^(NSE|BSE):OPT:[A-Z0-9]{1,32}:\d{4}-\d{2}-\d{2}:\d+(\.\d+)?:(CE|PE)$/;

export function isExchangeCode(value: string): value is ExchangeCode {
  return (EXCHANGE_CODES as readonly string[]).includes(value);
}

export function isInstrumentKey(value: string): value is InstrumentKey {
  return INSTRUMENT_KEY_PATTERN.test(value);
}

export function isOptionType(value: string): value is OptionType {
  return (OPTION_TYPES as readonly string[]).includes(value);
}

export interface ParsedInstrumentKey {
  readonly exchangeCode: ExchangeCode;
  readonly segment: 'INDEX';
  readonly symbol: string;
}

export function parseInstrumentKey(key: string): ParsedInstrumentKey | null {
  if (!isInstrumentKey(key)) return null;
  const [exchangeCode, , symbol] = key.split(':') as [ExchangeCode, 'INDEX', string];
  return { exchangeCode, segment: 'INDEX', symbol };
}

export function buildInstrumentKey(exchangeCode: ExchangeCode, symbol: string): InstrumentKey {
  return `${exchangeCode}:INDEX:${symbol}`;
}

/** Strike rendered without trailing zeros: 24000 → "24000", 24050.5 → "24050.5". */
export function formatStrikeKey(strike: number): string {
  return Number.isInteger(strike) ? strike.toString() : strike.toFixed(4).replace(/\.?0+$/, '');
}

export function buildOptionContractKey(
  exchangeCode: ExchangeCode,
  underlyingSymbol: string,
  expiryDate: IsoDate,
  strike: number,
  optionType: OptionType,
): OptionContractKey {
  return `${exchangeCode}:OPT:${underlyingSymbol}:${expiryDate}:${formatStrikeKey(strike)}:${optionType}`;
}

export interface ParsedOptionContractKey {
  readonly exchangeCode: ExchangeCode;
  readonly underlyingSymbol: string;
  readonly expiryDate: IsoDate;
  readonly strike: number;
  readonly optionType: OptionType;
}

export function parseOptionContractKey(key: string): ParsedOptionContractKey | null {
  if (!OPTION_CONTRACT_KEY_PATTERN.test(key)) return null;
  const [exchangeCode, , underlyingSymbol, expiryDate, strikeText, optionType] = key.split(':') as [
    ExchangeCode,
    'OPT',
    string,
    string,
    string,
    OptionType,
  ];
  const strike = Number(strikeText);
  if (!Number.isFinite(strike)) return null;
  return { exchangeCode, underlyingSymbol, expiryDate, strike, optionType };
}

/** Date → `YYYY-MM-DD` using UTC calendar fields (Prisma `@db.Date` round-trips as UTC midnight). */
export function toIsoDate(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

export function isoDateToUtcDate(isoDate: IsoDate): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** `YYYY-MM-DD` of the current calendar day in IST (fixed +05:30, no DST). */
export function istIsoDate(nowMs: number): IsoDate {
  return new Date(nowMs + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Epoch ms of 15:30 IST on the given calendar date (regular-session close, when options settle). */
export function istSessionCloseMs(isoDate: IsoDate): number {
  return Date.parse(`${isoDate}T15:30:00.000+05:30`);
}
