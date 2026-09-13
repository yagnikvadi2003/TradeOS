import { describe, expect, it } from 'vitest';
import { type IndexTick, type OptionTick } from '@/modules/market-stream/domain/market-update';
import { type Alert } from '@/modules/user-data/user-data.types';
import { AlertIndex, conditionMet, evaluate } from './alert-engine';

const alert = (
  id: string,
  instrumentKey: string,
  condition: Alert['condition'],
  threshold: number,
): Alert => ({
  id,
  sessionId: 's',
  instrumentKey,
  condition,
  threshold,
  status: 'ACTIVE',
  repeat: false,
  note: null,
  triggeredAt: null,
  createdAt: 1,
});
const index = (ltp: number, changePercent = 0): IndexTick => ({
  kind: 'index',
  instrumentKey: 'NSE:INDEX:NIFTY50',
  timestamp: 1,
  receivedAt: 1,
  ltp,
  previousClose: 1,
  open: null,
  high: null,
  low: null,
  change: null,
  changePercent,
  volume: null,
  source: 'simulated',
});
const option = (iv: number, oiChange: number): OptionTick => ({
  kind: 'option',
  contractKey: 'NSE:OPT:NIFTY50:2026-09-15:24000:CE',
  underlyingKey: 'NSE:INDEX:NIFTY50',
  exchangeCode: 'NSE',
  expiryDate: '2026-09-15',
  strike: 24000,
  optionType: 'CE',
  timestamp: 1,
  receivedAt: 1,
  ltp: 1,
  previousClose: null,
  change: null,
  changePercent: null,
  volume: null,
  openInterest: null,
  openInterestChange: oiChange,
  impliedVolatility: iv,
  bid: null,
  ask: null,
  bidQuantity: null,
  askQuantity: null,
  greeks: null,
  source: 'simulated',
});

describe('alert engine', () => {
  it('evaluates only alerts on the updated key, by condition', () => {
    const idx = new AlertIndex();
    expect(idx.add(alert('a', 'NSE:INDEX:NIFTY50', 'PRICE_ABOVE', 24_000))).toBe(true);
    expect(idx.add(alert('b', 'NSE:INDEX:NIFTY50', 'PRICE_BELOW', 23_000))).toBe(false);
    idx.add(alert('c', 'NSE:OPT:NIFTY50:2026-09-15:24000:CE', 'IV_ABOVE', 15));
    idx.add(alert('d', 'NSE:OPT:NIFTY50:2026-09-15:24000:CE', 'OI_CHANGE_ABOVE', 1000));
    idx.add(alert('e', 'BSE:INDEX:SENSEX', 'PRICE_ABOVE', 1));
    const hits = evaluate(idx, [index(24_100), option(16, -1500)]);
    expect(hits.map((h) => h.alert.id).sort()).toEqual(['a', 'c', 'd']);
    expect(hits.find((h) => h.alert.id === 'd')?.value).toBe(-1500);
    expect(evaluate(idx, [index(23_500)])).toEqual([]);
    expect(idx.remove(alert('a', 'NSE:INDEX:NIFTY50', 'PRICE_ABOVE', 0))).toBe(false);
    expect(idx.remove(alert('b', 'NSE:INDEX:NIFTY50', 'PRICE_BELOW', 0))).toBe(true);
    expect(idx.keys()).toEqual(['NSE:OPT:NIFTY50:2026-09-15:24000:CE', 'BSE:INDEX:SENSEX']);
  });

  it('ignores conditions whose field is unavailable and compares PCR bounds', () => {
    const idx = new AlertIndex();
    idx.add(alert('v', 'NSE:INDEX:NIFTY50', 'VOLUME_ABOVE', 1)); // indexes have no volume
    expect(evaluate(idx, [index(24_100)])).toEqual([]);
    expect(conditionMet('PCR_ABOVE', 1.2, 1.1)).toBe(true);
    expect(conditionMet('PCR_BELOW', 0.7, 0.8)).toBe(true);
    expect(conditionMet('OI_CHANGE_ABOVE', -500, 400)).toBe(true);
  });
});
