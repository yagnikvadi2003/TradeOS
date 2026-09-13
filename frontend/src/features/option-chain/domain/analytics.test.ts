import { describe, expect, it } from 'vitest';
import { simulateExpiries, simulateSnapshot } from '@/services/api/option-chain.simulator';
import { computeMaxPain, computeOptionAnalytics } from './analytics';

const NOW = Date.UTC(2026, 8, 8, 5, 30);
const KEY = 'NSE:INDEX:NIFTY50' as const;

describe('option analytics (frontend twin)', () => {
  const snapshot = simulateSnapshot(KEY, simulateExpiries(KEY, NOW)[0]!, NOW, 10);

  it('produces the same shape as the API and stays consistent with totals', () => {
    const a = computeOptionAnalytics(snapshot.strikes, snapshot.atmStrike, snapshot.underlying.ltp);
    expect(a.derived).toBe(true);
    expect(a.oiPcr).toBe(snapshot.totals.putCallRatio);
    expect(a.maxPain).not.toBeNull();
    expect(a.oiConcentration.ce).toHaveLength(3);
    expect(a.oiConcentration.ce[0]!.share).toBeGreaterThan(0);
    for (const s of a.supportCandidates) expect(s).toBeLessThanOrEqual(snapshot.underlying.ltp);
    for (const r of a.resistanceCandidates)
      expect(r).toBeGreaterThanOrEqual(snapshot.underlying.ltp);
    expect(snapshot.analytics).toEqual(a);
  });

  it('max pain sits between the heaviest OI walls', () => {
    const pain = computeMaxPain(snapshot.strikes)!;
    const strikes = snapshot.strikes.map((s) => s.strike);
    expect(pain).toBeGreaterThanOrEqual(Math.min(...strikes));
    expect(pain).toBeLessThanOrEqual(Math.max(...strikes));
    expect(computeMaxPain([])).toBeNull();
  });
});
