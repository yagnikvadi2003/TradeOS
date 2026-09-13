import { describe, expect, it } from 'vitest';
import { buildOptionContractKey } from '@/common/market/market-primitives';
import { type OptionContract, type OptionMarketData, type UnderlyingMarketData } from './domain';
import { assembleOptionChain, resolveAtmStrike } from './option-chain.assembler';

const KEY = 'NSE:INDEX:NIFTY50' as const;

function contract(strike: number, optionType: 'CE' | 'PE'): OptionContract {
  return {
    contractKey: buildOptionContractKey('NSE', 'NIFTY50', '2026-09-15', strike, optionType),
    underlyingKey: KEY,
    exchangeCode: 'NSE',
    tradingSymbol: `NIFTY${strike}${optionType}`,
    expiryDate: '2026-09-15',
    strike,
    optionType,
    lotSize: 75,
    tickSize: 0.05,
  };
}

function market(c: OptionContract, ltp: number, oi: number, updatedAt = 1_000): OptionMarketData {
  return {
    contractKey: c.contractKey,
    ltp,
    previousClose: ltp,
    change: 0,
    changePercent: 0,
    volume: 10,
    openInterest: oi,
    openInterestChange: 0,
    impliedVolatility: 12,
    bid: ltp - 0.05,
    ask: ltp + 0.05,
    bidQuantity: 75,
    askQuantity: 75,
    greeks: null,
    updatedAt,
    source: 'snapshot',
  };
}

const underlying: UnderlyingMarketData = {
  instrumentKey: KEY,
  ltp: 24_030,
  previousClose: 24_000,
  open: 24_010,
  high: 24_100,
  low: 23_950,
  change: 30,
  changePercent: 0.125,
  updatedAt: 1_000,
  source: 'snapshot',
};

describe('resolveAtmStrike', () => {
  it('picks the nearest strike and the lower one on a tie', () => {
    expect(resolveAtmStrike(24_030, [23_950, 24_000, 24_050])).toBe(24_050);
    expect(resolveAtmStrike(24_025, [24_000, 24_050])).toBe(24_000);
  });
});

describe('assembleOptionChain', () => {
  const contracts = [
    contract(23_950, 'CE'),
    contract(23_950, 'PE'),
    contract(24_000, 'CE'),
    contract(24_000, 'PE'),
    contract(24_050, 'CE'),
    contract(24_050, 'PE'),
  ];

  it('groups legs by strike, marks ATM and computes moneyness steps', () => {
    const snapshot = assembleOptionChain({
      instrumentKey: KEY,
      expiry: {
        instrumentKey: KEY,
        expiryDate: '2026-09-15',
        cycle: 'WEEKLY',
        daysToExpiry: 7,
        isActive: true,
      },
      underlying,
      contracts,
      marketData: contracts.map((c) => market(c, c.optionType === 'CE' ? 100 : 60, 1_000)),
      strikeStep: 50,
      lotSize: 75,
      asOf: 2_000,
    });
    expect(snapshot.strikes.map((s) => s.strike)).toEqual([23_950, 24_000, 24_050]);
    expect(snapshot.atmStrike).toBe(24_050);
    expect(snapshot.strikes.map((s) => s.stepsFromAtm)).toEqual([-2, -1, 0]);
    expect(snapshot.strikes[2]?.isAtm).toBe(true);
    expect(snapshot.totals).toEqual({
      ceOpenInterest: 3_000,
      peOpenInterest: 3_000,
      ceVolume: 30,
      peVolume: 30,
      putCallRatio: 1,
    });
  });

  it('derives intrinsic and extrinsic value from the underlying level', () => {
    const snapshot = assembleOptionChain({
      instrumentKey: KEY,
      expiry: {
        instrumentKey: KEY,
        expiryDate: '2026-09-15',
        cycle: 'WEEKLY',
        daysToExpiry: 7,
        isActive: true,
      },
      underlying,
      contracts,
      marketData: contracts.map((c) => market(c, 100, 0)),
      strikeStep: 50,
      lotSize: 75,
      asOf: 2_000,
    });
    const itmCall = snapshot.strikes[0]!.ce!;
    expect(itmCall.value).toMatchObject({ intrinsic: 80, extrinsic: 20 });
    const otmPut = snapshot.strikes[0]!.pe!;
    expect(otmPut.value).toMatchObject({ intrinsic: 0, extrinsic: 100 });
    expect(snapshot.totals.putCallRatio).toBeNull();
  });

  it('fills missing market data with nulls and tracks the oldest update', () => {
    const snapshot = assembleOptionChain({
      instrumentKey: KEY,
      expiry: {
        instrumentKey: KEY,
        expiryDate: '2026-09-15',
        cycle: 'WEEKLY',
        daysToExpiry: 7,
        isActive: true,
      },
      underlying,
      contracts,
      marketData: [market(contracts[0]!, 5, 1, 500), market(contracts[1]!, 5, 1, 900)],
      strikeStep: 50,
      lotSize: 75,
      asOf: 2_000,
    });
    expect(snapshot.oldestUpdateAt).toBe(500);
    const missing = snapshot.strikes[1]!.ce!;
    expect(missing.market.ltp).toBeNull();
    expect(missing.value.extrinsic).toBeNull();
    expect(missing.market.updatedAt).toBe(2_000);
  });
});
