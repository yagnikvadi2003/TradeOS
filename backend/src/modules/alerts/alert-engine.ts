import { type MarketUpdate } from '@/modules/market-stream/domain/market-update';
import { type Alert, type AlertCondition } from '@/modules/user-data/user-data.types';

/**
 * Pure evaluation. Each condition reads exactly one field of the update
 * that arrived for the alert's instrument, so evaluation cost is
 * O(alerts on that key) per update — never O(all alerts).
 * PCR conditions read chain-level state and are evaluated by the service
 * on option-chain snapshots, not here.
 */
export function observedValue(update: MarketUpdate, condition: AlertCondition): number | null {
  switch (condition) {
    case 'PRICE_ABOVE':
    case 'PRICE_BELOW':
      return update.ltp;
    case 'CHANGE_PERCENT_ABOVE':
    case 'CHANGE_PERCENT_BELOW':
      return update.changePercent;
    case 'VOLUME_ABOVE':
      return update.volume;
    case 'OI_CHANGE_ABOVE':
      return update.kind === 'option' ? update.openInterestChange : null;
    case 'IV_ABOVE':
    case 'IV_BELOW':
      return update.kind === 'option' ? update.impliedVolatility : null;
    case 'PCR_ABOVE':
    case 'PCR_BELOW':
      return null;
  }
}

export function conditionMet(condition: AlertCondition, value: number, threshold: number): boolean {
  switch (condition) {
    case 'PRICE_ABOVE':
    case 'CHANGE_PERCENT_ABOVE':
    case 'VOLUME_ABOVE':
    case 'IV_ABOVE':
    case 'PCR_ABOVE':
      return value >= threshold;
    case 'OI_CHANGE_ABOVE':
      return Math.abs(value) >= threshold;
    case 'PRICE_BELOW':
    case 'CHANGE_PERCENT_BELOW':
    case 'IV_BELOW':
    case 'PCR_BELOW':
      return value <= threshold;
  }
}

/** Instrument → active alerts. O(1) lookup on the hot path; bounded by active alerts. */
export class AlertIndex {
  private readonly byKey = new Map<string, Map<string, Alert>>();

  get size(): number {
    let n = 0;
    for (const m of this.byKey.values()) n += m.size;
    return n;
  }

  keys(): string[] {
    return [...this.byKey.keys()];
  }

  add(alert: Alert): boolean {
    let m = this.byKey.get(alert.instrumentKey);
    const first = !m;
    if (!m) {
      m = new Map();
      this.byKey.set(alert.instrumentKey, m);
    }
    m.set(alert.id, alert);
    return first;
  }

  /** Returns true when the key has no alerts left (caller releases the stream subscription). */
  remove(alert: Pick<Alert, 'id' | 'instrumentKey'>): boolean {
    const m = this.byKey.get(alert.instrumentKey);
    if (!m) return false;
    m.delete(alert.id);
    if (m.size === 0) {
      this.byKey.delete(alert.instrumentKey);
      return true;
    }
    return false;
  }

  get(key: string): Alert[] {
    const m = this.byKey.get(key);
    return m ? [...m.values()] : [];
  }
}

export interface Evaluation {
  readonly alert: Alert;
  readonly value: number;
}

export function evaluate(index: AlertIndex, updates: readonly MarketUpdate[]): Evaluation[] {
  const hits: Evaluation[] = [];
  for (const update of updates) {
    const key = update.kind === 'index' ? update.instrumentKey : update.contractKey;
    for (const alert of index.get(key)) {
      const value = observedValue(update, alert.condition);
      if (value === null) continue;
      if (conditionMet(alert.condition, value, alert.threshold)) hits.push({ alert, value });
    }
  }
  return hits;
}
