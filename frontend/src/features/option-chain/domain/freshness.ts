/** Age classification of the snapshot on screen. Pure; shared by the indicator and tests. */
export type Freshness = 'fresh' | 'aging' | 'stale';

export const FRESHNESS_THRESHOLDS = { agingAfterMs: 5_000, staleAfterMs: 30_000 } as const;

export function classifyFreshness(ageMs: number): Freshness {
  if (ageMs >= FRESHNESS_THRESHOLDS.staleAfterMs) return 'stale';
  if (ageMs >= FRESHNESS_THRESHOLDS.agingAfterMs) return 'aging';
  return 'fresh';
}
