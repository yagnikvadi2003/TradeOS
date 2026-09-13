import { type OptionStrike } from './types';

/**
 * TradeOS-derived option analytics (frontend twin of the backend module,
 * used only by the simulator so mock snapshots carry the same shape). The
 * UI always labels these as derived; they are never provider facts.
 */
export interface StrikeWeight {
  readonly strike: number;
  readonly value: number;
  readonly share: number;
}
export interface OptionAnalytics {
  readonly derived: true;
  readonly oiPcr: number | null;
  readonly volumePcr: number | null;
  readonly maxPain: number | null;
  readonly atmIv: number | null;
  readonly oiConcentration: { readonly ce: StrikeWeight[]; readonly pe: StrikeWeight[] };
  readonly oiChangeConcentration: { readonly ce: StrikeWeight[]; readonly pe: StrikeWeight[] };
  readonly volumeConcentration: { readonly ce: StrikeWeight[]; readonly pe: StrikeWeight[] };
  readonly supportCandidates: number[];
  readonly resistanceCandidates: number[];
}

const TOP = 3;
const ratio = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 1000 : null);

function top(
  strikes: readonly OptionStrike[],
  side: 'ce' | 'pe',
  pick: (s: OptionStrike) => number | null | undefined,
  absolute = false,
): StrikeWeight[] {
  const rows: { strike: number; value: number }[] = [];
  let total = 0;
  for (const s of strikes) {
    const value = s[side] ? pick(s) : null;
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

export function computeMaxPain(strikes: readonly OptionStrike[]): number | null {
  const rows = strikes
    .map((s) => ({
      strike: s.strike,
      ceOi: s.ce?.market.openInterest ?? 0,
      peOi: s.pe?.market.openInterest ?? 0,
    }))
    .filter((r) => r.ceOi > 0 || r.peOi > 0);
  let best: { strike: number; pain: number } | null = null;
  for (const c of rows) {
    let pain = 0;
    for (const r of rows) {
      if (c.strike > r.strike) pain += (c.strike - r.strike) * r.ceOi;
      if (c.strike < r.strike) pain += (r.strike - c.strike) * r.peOi;
    }
    if (!best || pain < best.pain) best = { strike: c.strike, pain };
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
  const peOiTop = top(strikes, 'pe', (s) => s.pe?.market.openInterest);
  const ceOiTop = top(strikes, 'ce', (s) => s.ce?.market.openInterest);
  return {
    derived: true,
    oiPcr: ratio(peOi, ceOi),
    volumePcr: ratio(peVol, ceVol),
    maxPain: computeMaxPain(strikes),
    atmIv: ivs.length
      ? Math.round((ivs.reduce((a, b) => a + b, 0) / ivs.length) * 100) / 100
      : null,
    oiConcentration: { ce: ceOiTop, pe: peOiTop },
    oiChangeConcentration: {
      ce: top(strikes, 'ce', (s) => s.ce?.market.openInterestChange, true),
      pe: top(strikes, 'pe', (s) => s.pe?.market.openInterestChange, true),
    },
    volumeConcentration: {
      ce: top(strikes, 'ce', (s) => s.ce?.market.volume),
      pe: top(strikes, 'pe', (s) => s.pe?.market.volume),
    },
    supportCandidates: peOiTop.filter((w) => w.strike <= spot).map((w) => w.strike),
    resistanceCandidates: ceOiTop.filter((w) => w.strike >= spot).map((w) => w.strike),
  };
}
