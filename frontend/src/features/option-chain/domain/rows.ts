import {
  type Moneyness,
  type OptionChainRow,
  type OptionChainSnapshot,
  type OptionLeg,
} from './types';

function moneyness(strike: number, level: number, type: 'CE' | 'PE', isAtm: boolean): Moneyness {
  if (isAtm) return 'ATM';
  const itm = type === 'CE' ? strike < level : strike > level;
  return itm ? 'ITM' : 'OTM';
}

/** Row id is the strike rendered without float noise — stable across snapshots. */
export function rowIdForStrike(strike: number): string {
  return Number.isInteger(strike) ? String(strike) : strike.toFixed(4).replace(/\.?0+$/, '');
}

export function snapshotToRows(snapshot: OptionChainSnapshot): OptionChainRow[] {
  const level = snapshot.underlying.ltp;
  return snapshot.strikes.map((s) => ({
    id: rowIdForStrike(s.strike),
    strike: s.strike,
    isAtm: s.isAtm,
    stepsFromAtm: s.stepsFromAtm,
    ce: s.ce,
    pe: s.pe,
    ceMoneyness: moneyness(s.strike, level, 'CE', s.isAtm),
    peMoneyness: moneyness(s.strike, level, 'PE', s.isAtm),
  }));
}

/** Rows within `steps` of ATM (inclusive); `null` keeps every strike. */
export function windowRows(
  rows: readonly OptionChainRow[],
  steps: number | null,
): OptionChainRow[] {
  if (steps === null) return [...rows];
  return rows.filter((r) => Math.abs(r.stepsFromAtm) <= steps);
}

function legChanged(a: OptionLeg | null, b: OptionLeg | null): boolean {
  if (a === b) return false;
  if (!a || !b) return true;
  const x = a.market;
  const y = b.market;
  return (
    x.updatedAt !== y.updatedAt ||
    x.ltp !== y.ltp ||
    x.openInterest !== y.openInterest ||
    x.openInterestChange !== y.openInterestChange ||
    x.volume !== y.volume ||
    x.impliedVolatility !== y.impliedVolatility ||
    x.bid !== y.bid ||
    x.ask !== y.ask ||
    x.bidQuantity !== y.bidQuantity ||
    x.askQuantity !== y.askQuantity ||
    x.intrinsic !== y.intrinsic
  );
}

export function rowChanged(a: OptionChainRow, b: OptionChainRow): boolean {
  return (
    a.isAtm !== b.isAtm ||
    a.stepsFromAtm !== b.stepsFromAtm ||
    a.ceMoneyness !== b.ceMoneyness ||
    a.peMoneyness !== b.peMoneyness ||
    legChanged(a.ce, b.ce) ||
    legChanged(a.pe, b.pe)
  );
}

export interface RowTransaction {
  readonly add: OptionChainRow[];
  readonly update: OptionChainRow[];
  readonly remove: OptionChainRow[];
}

/**
 * Diff two row sets by id so only rows whose visible values changed reach
 * the grid. Unchanged rows keep their existing object references.
 */
export function diffRows(
  previous: ReadonlyMap<string, OptionChainRow>,
  next: readonly OptionChainRow[],
): RowTransaction {
  const add: OptionChainRow[] = [];
  const update: OptionChainRow[] = [];
  const seen = new Set<string>();
  for (const row of next) {
    seen.add(row.id);
    const old = previous.get(row.id);
    if (!old) add.push(row);
    else if (rowChanged(old, row)) update.push(row);
  }
  const remove: OptionChainRow[] = [];
  for (const [id, row] of previous) if (!seen.has(id)) remove.push(row);
  return { add, update, remove };
}
