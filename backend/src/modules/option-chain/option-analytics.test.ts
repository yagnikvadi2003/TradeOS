import { describe, expect, it } from 'vitest';
import { type OptionLeg, type OptionStrike } from './domain';
import { computeMaxPain, computeOptionAnalytics } from './option-analytics';

function leg(
  strike: number,
  type: 'CE' | 'PE',
  oi: number,
  vol: number,
  iv: number,
  oiChange = 0,
): OptionLeg {
  return {
    contract: {
      contractKey: `NSE:OPT:X:2026-09-15:${strike}:${type}`,
      underlyingKey: 'NSE:INDEX:X',
      exchangeCode: 'NSE',
      tradingSymbol: 'x',
      expiryDate: '2026-09-15',
      strike,
      optionType: type,
      lotSize: 1,
      tickSize: 0.05,
    },
    market: {
      contractKey: `NSE:OPT:X:2026-09-15:${strike}:${type}`,
      ltp: 1,
      previousClose: 1,
      change: 0,
      changePercent: 0,
      volume: vol,
      openInterest: oi,
      openInterestChange: oiChange,
      impliedVolatility: iv,
      bid: null,
      ask: null,
      bidQuantity: null,
      askQuantity: null,
      greeks: null,
      updatedAt: 1,
      source: 'simulated',
    },
    value: { intrinsic: 0, extrinsic: 1, spread: null },
  };
}
const row = (
  strike: number,
  ceOi: number,
  peOi: number,
  ceVol = 0,
  peVol = 0,
  iv = 12,
  dCe = 0,
  dPe = 0,
): OptionStrike => ({
  strike,
  isAtm: strike === 100,
  stepsFromAtm: (strike - 100) / 10,
  ce: leg(strike, 'CE', ceOi, ceVol, iv, dCe),
  pe: leg(strike, 'PE', peOi, peVol, iv + 2, dPe),
});

describe('option analytics (derived)', () => {
  const strikes = [
    row(80, 100, 900, 5, 50, 12, 10, -5),
    row(90, 300, 700, 10, 40),
    row(100, 500, 500, 30, 30, 14),
    row(110, 800, 200, 40, 10, 12, -60, 3),
    row(120, 900, 100, 50, 5),
  ];

  it('computes PCRs, ATM IV, concentrations and S/R candidates', () => {
    const a = computeOptionAnalytics(strikes, 100, 101);
    expect(a.derived).toBe(true);
    expect(a.oiPcr).toBe(Math.round((2400 / 2600) * 1000) / 1000);
    expect(a.volumePcr).toBe(1);
    expect(a.atmIv).toBe(15); // mean of 14 and 16
    expect(a.oiConcentration.ce.map((w) => w.strike)).toEqual([120, 110, 100]);
    expect(a.oiConcentration.pe.map((w) => w.strike)).toEqual([80, 90, 100]);
    expect(a.oiConcentration.ce[0]?.share).toBe(Math.round((900 / 2600) * 1000) / 1000);
    expect(a.oiChangeConcentration.ce[0]).toMatchObject({ strike: 110, value: -60 });
    expect(a.supportCandidates).toEqual([80, 90, 100]);
    expect(a.resistanceCandidates).toEqual([120, 110]);
  });

  it('finds max pain where writers pay least', () => {
    expect(computeMaxPain(strikes)).toBe(100);
    // Heavy put OI at 120 and call OI at 80 pulls pain to the middle strike range.
    expect(computeMaxPain([row(80, 1000, 0), row(120, 0, 1000)])).toBeOneOf([80, 120]);
    expect(computeMaxPain([])).toBeNull();
  });

  it('degrades to nulls without data', () => {
    const a = computeOptionAnalytics(
      [{ strike: 100, isAtm: true, stepsFromAtm: 0, ce: null, pe: null }],
      100,
      100,
    );
    expect(a).toMatchObject({
      oiPcr: null,
      volumePcr: null,
      maxPain: null,
      atmIv: null,
      supportCandidates: [],
      resistanceCandidates: [],
    });
  });
});
