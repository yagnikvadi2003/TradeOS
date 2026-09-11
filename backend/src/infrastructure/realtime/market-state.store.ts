import { type MarketUpdate, streamKeyOf } from '@/modules/market-stream/domain/market-update';

/**
 * Live market state: the latest normalized update per stream key.
 *
 * In-process for single-instance mode. The Redis implementation mirrors
 * state into a hash in coalesced batches so a second instance (or a fresh
 * one after restart) can serve snapshots without re-warming from the feed.
 */
export interface MarketStateStore {
  readonly kind: 'memory' | 'redis';
  get(key: string): MarketUpdate | undefined;
  getMany(keys: readonly string[]): MarketUpdate[];
  /** Apply a batch; returns the updates that were actually newer than stored state. */
  apply(updates: readonly MarketUpdate[]): MarketUpdate[];
  delete(keys: readonly string[]): void;
  readonly size: number;
}

export const MARKET_STATE_STORE = Symbol('MARKET_STATE_STORE');

export class InMemoryMarketStateStore implements MarketStateStore {
  readonly kind: 'memory' | 'redis' = 'memory';
  protected readonly state = new Map<string, MarketUpdate>();

  get(key: string): MarketUpdate | undefined {
    return this.state.get(key);
  }

  getMany(keys: readonly string[]): MarketUpdate[] {
    const out: MarketUpdate[] = [];
    for (const key of keys) {
      const value = this.state.get(key);
      if (value) out.push(value);
    }
    return out;
  }

  apply(updates: readonly MarketUpdate[]): MarketUpdate[] {
    const applied: MarketUpdate[] = [];
    for (const update of updates) {
      const key = streamKeyOf(update);
      const existing = this.state.get(key);
      // Out-of-order or duplicate provider events never move state backwards.
      if (existing && existing.timestamp > update.timestamp) continue;
      this.state.set(key, update);
      applied.push(update);
    }
    return applied;
  }

  delete(keys: readonly string[]): void {
    for (const key of keys) this.state.delete(key);
  }

  get size(): number {
    return this.state.size;
  }
}
