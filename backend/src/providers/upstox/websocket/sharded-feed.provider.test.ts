import { describe, expect, it } from 'vitest';
import { type ConnectionState } from '@/infrastructure/realtime/connection-state';
import { type FeedStateChange } from '@/providers/feed-provider.interface';
import { type StreamKey } from '@/modules/market-stream/domain/market-update';
import { type FeedShard, ShardedMarketFeedProvider } from './sharded-feed.provider';

function shard(): FeedShard & { keys: Set<string>; setState(s: ConnectionState): void } {
  const listeners = new Set<(c: FeedStateChange) => void>();
  const keys = new Set<string>();
  let state: ConnectionState = 'CONNECTED';
  return {
    name: 'upstox',
    dataSource: 'live',
    keys,
    get state() {
      return state;
    },
    get activeUpstreamCount() {
      return keys.size;
    },
    setState(s) {
      const previous = state;
      state = s;
      for (const l of listeners) l({ state: s, previous, at: 1 });
    },
    start: () => Promise.resolve(),
    stop: () => Promise.resolve(),
    subscribe: (k) => k.forEach((x) => keys.add(x)),
    unsubscribe: (k) => k.forEach((x) => keys.delete(x)),
    onUpdates: () => () => undefined,
    onStateChange: (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    onMarketStatus: () => () => undefined,
  };
}

const k = (s: string): StreamKey => s as StreamKey;

describe('ShardedMarketFeedProvider', () => {
  it('assigns each key to exactly one shard, first-fit by capacity, and releases on unsubscribe', () => {
    const a = shard();
    const b = shard();
    const counters: Record<string, number> = {};
    const sharded = new ShardedMarketFeedProvider([a, b], {
      capacityPerShard: 2,
      metrics: { inc: (n) => (counters[n] = (counters[n] ?? 0) + 1), set: () => undefined },
    });
    sharded.subscribe(['K1', 'K2', 'K3', 'K3', 'K4', 'K5'].map(k));
    expect([...a.keys]).toEqual(['K1', 'K2']);
    expect([...b.keys]).toEqual(['K3', 'K4']);
    expect(counters.subscriptionLimitRejections).toBe(1); // K5 over total capacity
    expect(sharded.shardOf(k('K3'))).toBe(1);
    sharded.unsubscribe(['K1', 'K3'].map(k));
    expect(a.keys.has('K1')).toBe(false);
    expect(b.keys.has('K3')).toBe(false);
    sharded.subscribe([k('K5')]);
    expect(a.keys.has('K5')).toBe(true); // reuses freed capacity on shard 0
  });

  it('reports the worst shard state so a dead socket is never masked', () => {
    const a = shard();
    const b = shard();
    const sharded = new ShardedMarketFeedProvider([a, b], { capacityPerShard: 10 });
    const seen: string[] = [];
    sharded.onStateChange((c) => seen.push(`${c.state}${c.reason ? `(${c.reason})` : ''}`));
    expect(sharded.state).toBe('CONNECTED');
    b.setState('RECONNECTING');
    expect(sharded.state).toBe('RECONNECTING');
    a.setState('DEGRADED');
    expect(sharded.state).toBe('RECONNECTING');
    b.setState('CONNECTED');
    expect(sharded.state).toBe('DEGRADED');
    expect(seen).toEqual(['RECONNECTING', 'RECONNECTING', 'DEGRADED']);
  });
});
