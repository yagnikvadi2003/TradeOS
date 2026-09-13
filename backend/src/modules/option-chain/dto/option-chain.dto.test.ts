import { describe, expect, it } from 'vitest';
import { instrumentParamSchema, snapshotQuerySchema } from './option-chain.params';
import { optionChainSnapshotDtoSchema, snapshotResponseSchema } from './option-chain.response';

describe('option-chain request schemas', () => {
  it('accepts and normalizes a valid instrument key', () => {
    expect(instrumentParamSchema.parse({ instrument: ' nse:index:nifty50 ' })).toEqual({
      instrument: 'NSE:INDEX:NIFTY50',
    });
  });

  it.each(['NSE:NIFTY50', 'NSE:OPT:NIFTY50', 'MCX:INDEX:GOLD', 'NSE:INDEX:', 'NSE:INDEX:a b'])(
    'rejects malformed instrument %s',
    (instrument) => {
      expect(instrumentParamSchema.safeParse({ instrument }).success).toBe(false);
    },
  );

  it('validates the optional expiry query', () => {
    expect(snapshotQuerySchema.parse({})).toEqual({});
    expect(snapshotQuerySchema.parse({ expiry: '2026-09-15' })).toEqual({ expiry: '2026-09-15' });
    expect(snapshotQuerySchema.safeParse({ expiry: '2026-13-01' }).success).toBe(false);
    expect(snapshotQuerySchema.safeParse({ expiry: '15/09/2026' }).success).toBe(false);
    expect(snapshotQuerySchema.safeParse({ expiry: 12 }).success).toBe(false);
  });
});

describe('option-chain response schemas', () => {
  const leg = {
    contract: {
      contractKey: 'NSE:OPT:NIFTY50:2026-09-15:24000:CE',
      underlyingKey: 'NSE:INDEX:NIFTY50',
      exchangeCode: 'NSE',
      tradingSymbol: 'NIFTY24000CE',
      expiryDate: '2026-09-15',
      strike: 24000,
      optionType: 'CE',
      lotSize: 75,
      tickSize: 0.05,
    },
    market: {
      ltp: 120.5,
      previousClose: 110,
      change: 10.5,
      changePercent: 9.55,
      volume: 1000,
      openInterest: 5000,
      openInterestChange: 100,
      impliedVolatility: 13.2,
      bid: 120,
      ask: 121,
      bidQuantity: 75,
      askQuantity: 150,
      greeks: { delta: 0.52, gamma: 0.001, theta: -8.1, vega: 12 },
      intrinsic: 30,
      extrinsic: 90.5,
      spread: 0.1,
      updatedAt: 1_700_000_000_000,
    },
  };
  const snapshot = {
    instrumentKey: 'NSE:INDEX:NIFTY50',
    expiry: {
      instrumentKey: 'NSE:INDEX:NIFTY50',
      expiryDate: '2026-09-15',
      cycle: 'WEEKLY',
      daysToExpiry: 7,
    },
    underlying: {
      instrumentKey: 'NSE:INDEX:NIFTY50',
      ltp: 24030,
      previousClose: 24000,
      open: 24010,
      high: 24100,
      low: 23950,
      change: 30,
      changePercent: 0.13,
      updatedAt: 1_700_000_000_000,
      source: 'snapshot',
    },
    atmStrike: 24050,
    strikeStep: 50,
    lotSize: 75,
    strikes: [{ strike: 24000, isAtm: false, stepsFromAtm: -1, ce: leg, pe: null }],
    totals: {
      ceOpenInterest: 5000,
      peOpenInterest: 0,
      ceVolume: 1000,
      peVolume: 0,
      putCallRatio: 0,
    },
    analytics: {
      derived: true,
      oiPcr: 0,
      volumePcr: 0,
      maxPain: 24000,
      atmIv: null,
      oiConcentration: { ce: [{ strike: 24000, value: 5000, share: 1 }], pe: [] },
      oiChangeConcentration: { ce: [], pe: [] },
      volumeConcentration: { ce: [{ strike: 24000, value: 1000, share: 1 }], pe: [] },
      supportCandidates: [],
      resistanceCandidates: [],
    },
    asOf: 1_700_000_000_000,
    oldestUpdateAt: 1_700_000_000_000,
    source: 'snapshot',
  };

  it('accepts a well-formed snapshot envelope', () => {
    expect(
      snapshotResponseSchema.safeParse({ data: snapshot, meta: { version: 'v1', generatedAt: 1 } })
        .success,
    ).toBe(true);
  });

  it('rejects NaN, malformed keys and unknown sources', () => {
    expect(
      optionChainSnapshotDtoSchema.safeParse({ ...snapshot, atmStrike: Number.NaN }).success,
    ).toBe(false);
    expect(
      optionChainSnapshotDtoSchema.safeParse({ ...snapshot, instrumentKey: 'NSE:NIFTY' }).success,
    ).toBe(false);
    expect(optionChainSnapshotDtoSchema.safeParse({ ...snapshot, source: 'upstox' }).success).toBe(
      false,
    );
    expect(
      optionChainSnapshotDtoSchema.safeParse({
        ...snapshot,
        strikes: [
          {
            ...snapshot.strikes[0],
            ce: { ...leg, contract: { ...leg.contract, optionType: 'CALL' } },
          },
        ],
      }).success,
    ).toBe(false);
  });
});
