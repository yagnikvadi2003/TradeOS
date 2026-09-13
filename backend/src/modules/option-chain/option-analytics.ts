import { type OptionStrike } from './domain';

/**
 * TradeOS-derived option analytics. Everything here is computed from the
 * chain the provider delivered; nothing is a provider fact, and the DTO
 * carries `derived: true` so the UI can label it accordingly.
 *
 * Pure, allocation-light, O(n) in strikes (max pain is O(n²) on ≤ 100
 * strikes — sub-millisecond).
 */
export interface StrikeWeight {
  readonly strike: number;
  readonly value: number;
  /** Share of the side's total, 0–1. */
  readonly share: number;
}

export interface OptionAnalytics {
  readonly derived: true;
  /** PE OI / CE OI. */
  readonly oiPcr: number | null;
  /** PE volume / CE volume. */
  readonly volumePcr: number | null;
  /** Strike where option writers' aggregate payout is minimal. */
  readonly maxPain: number | null;
  /** Mean of ATM CE and PE implied volatility (percent). */
  readonly atmIv: number | null;
  /** Top strikes by open interest per side. */
  readonly oiConcentration: { readonly ce: StrikeWeight[]; readonly pe: StrikeWeight[] };
  /** Top strikes by absolute change in OI per side (signed value). */
  readonly oiChangeConcentration: { readonly ce: StrikeWeight[]; readonly pe: StrikeWeight[] };
  readonly volumeConcentration: { readonly ce: StrikeWeight[]; readonly pe: StrikeWeight[] };
  /** Highest PE OI strikes below spot (support) and CE OI strikes above (resistance). */
  readonly supportCandidates: number[];
  readonly resistanceCandidates: number[];
}

const TOP = 3;

function ratio(n: number, d: number): number | null {
  return d > 0 ? Math.round((n / d) * 1000) / 1000 : null;
}

function top(
  strikes: readonly OptionStrike[],
  side: 'ce' | 'pe',
  pick: (s: OptionStrike) => number | null,
  absolute = false,
): StrikeWeight[] {
  const rows: { strike: number; value: number }[] = [];
  let total = 0;
  for (const s of strikes) {
    const leg = s[side];
    const value = leg ? pick(s) : null;
    if (value === null || value === undefined) continue;
    rows.push({ strike: s.strike, value });
    total += absolute ? Math.abs(value) : value;
  }
  rows.sort((a, b) => (absolute ? Math.abs(b.value) - Math.abs(a.value) : b.value - a.value));
  return rows.slice(0, TOP).map((r) => ({
    strike: r.strike,
    value: r.value,
    share:
      total > 0 ? Math.round(((absolute ? Math.abs(r.value) : r.value) / total) * 1000) / 1000 : 0,
  }));
}

/** Max pain: the expiry price minimising total intrinsic value paid out across all OI. */
export function computeMaxPain(strikes: readonly OptionStrike[]): number | null {
  const rows = strikes
    .map((s) => ({
      strike: s.strike,
      ceOi: s.ce?.market.openInterest ?? 0,
      peOi: s.pe?.market.openInterest ?? 0,
    }))
    .filter((r) => r.ceOi > 0 || r.peOi > 0);
  if (rows.length === 0) return null;
  let best: { strike: number; pain: number } | null = null;
  for (const candidate of rows) {
    let pain = 0;
    for (const r of rows) {
      if (candidate.strike > r.strike) pain += (candidate.strike - r.strike) * r.ceOi;
      if (candidate.strike < r.strike) pain += (r.strike - candidate.strike) * r.peOi;
    }
    if (!best || pain < best.pain) best = { strike: candidate.strike, pain };
  }
  return best?.strike ?? null;
}

export function computeOptionAnalytics(
  strikes: readonly OptionStrike[],
  atmStrike: number,
  spot: number,
): OptionAnalytics {
  let ceOi = 0;
  let peOi = 0;
  let ceVol = 0;
  let peVol = 0;
  for (const s of strikes) {
    ceOi += s.ce?.market.openInterest ?? 0;
    peOi += s.pe?.market.openInterest ?? 0;
    ceVol += s.ce?.market.volume ?? 0;
    peVol += s.pe?.market.volume ?? 0;
  }
  const atm = strikes.find((s) => s.strike === atmStrike);
  const ivs = [atm?.ce?.market.impliedVolatility, atm?.pe?.market.impliedVolatility].filter(
    (v): v is number => typeof v === 'number',
  );
  const atmIv = ivs.length
    ? Math.round((ivs.reduce((a, b) => a + b, 0) / ivs.length) * 100) / 100
    : null;

  const peOiTop = top(strikes, 'pe', (s) => s.pe?.market.openInterest ?? null);
  const ceOiTop = top(strikes, 'ce', (s) => s.ce?.market.openInterest ?? null);
  return {
    derived: true,
    oiPcr: ratio(peOi, ceOi),
    volumePcr: ratio(peVol, ceVol),
    maxPain: computeMaxPain(strikes),
    atmIv,
    oiConcentration: { ce: ceOiTop, pe: peOiTop },
    oiChangeConcentration: {
      ce: top(strikes, 'ce', (s) => s.ce?.market.openInterestChange ?? null, true),
      pe: top(strikes, 'pe', (s) => s.pe?.market.openInterestChange ?? null, true),
    },
    volumeConcentration: {
      ce: top(strikes, 'ce', (s) => s.ce?.market.volume ?? null),
      pe: top(strikes, 'pe', (s) => s.pe?.market.volume ?? null),
    },
    supportCandidates: peOiTop.filter((w) => w.strike <= spot).map((w) => w.strike),
    resistanceCandidates: ceOiTop.filter((w) => w.strike >= spot).map((w) => w.strike),
  };
}
