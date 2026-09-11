import { describe, expect, it, vi } from 'vitest';
import { InMemoryMarketStateStore } from '@/infrastructure/realtime/market-state.store';
import { connectRedis, type RedisHandle } from './redis-client';
import { RedisFeedLease } from './redis-feed-lease';
import { RedisMarketStateStore } from './redis-market-state.store';
import { RedisMessageBus } from './redis-message-bus';

/** A tiny scripted ioredis stand-in: enough surface for the bus, lease and store. */
function fakeRedis(behaviour: { failing?: boolean } = {}) {
  const hash = new Map<string, string>();
  const kv = new Map<string, string>();
  const listeners = new Set<(channel: string, payload: string) => void>();
  const fail = () => Promise.reject(new Error('redis down'));
  const client = {
    publish: vi.fn((channel: string, payload: string) =>
      behaviour.failing
        ? fail()
        : (listeners.forEach((l) => l(channel, payload)), Promise.resolve(1)),
    ),
    hgetall: vi.fn(() => (behaviour.failing ? fail() : Promise.resolve(Object.fromEntries(hash)))),
    hdel: vi.fn(() => Promise.resolve(1)),
    multi: vi.fn(() => {
      const ops: (() => void)[] = [];
      const chain = {
        hset: (_k: string, fields: Record<string, string>) => (
          ops.push(() => Object.entries(fields).forEach(([k, v]) => hash.set(k, v))),
          chain
        ),
        expire: () => chain,
        exec: () => (behaviour.failing ? fail() : (ops.forEach((op) => op()), Promise.resolve([]))),
      };
      return chain;
    }),
    get: vi.fn((k: string) => Promise.resolve(kv.get(k) ?? null)),
    set: vi.fn((k: string, v: string, _px: string, _ttl: number, _nx: string) => {
      if (kv.has(k)) return Promise.resolve(null);
      kv.set(k, v);
      return Promise.resolve('OK');
    }),
    pexpire: vi.fn(() => Promise.resolve(1)),
    del: vi.fn((k: string) => (kv.delete(k), Promise.resolve(1))),
  };
  const subscriber = {
    on: vi.fn((event: string, handler: (channel: string, payload: string) => void) => {
      if (event === 'message') listeners.add(handler);
    }),
    subscribe: vi.fn(() => Promise.resolve(1)),
    unsubscribe: vi.fn(() => Promise.resolve(1)),
  };
  const handle = { client, subscriber, close: async () => {} } as unknown as RedisHandle;
  return { handle, hash, kv, client };
}

const tick = (ltp: number, ts: number) => ({
  kind: 'index' as const,
  instrumentKey: 'NSE:INDEX:NIFTY50' as const,
  timestamp: ts,
  receivedAt: ts,
  ltp,
  previousClose: null,
  open: null,
  high: null,
  low: null,
  change: null,
  changePercent: null,
  volume: null,
  source: 'simulated' as const,
});

describe('Redis unavailable', () => {
  it('connectRedis resolves null instead of throwing when the server is unreachable', async () => {
    const handle = await connectRedis('redis://127.0.0.1:1', 300);
    expect(handle).toBeNull();
  }, 10_000);

  it('the in-memory store and bus serve as drop-in fallbacks', () => {
    const store = new InMemoryMarketStateStore();
    expect(store.kind).toBe('memory');
    expect(store.apply([tick(1, 1)])).toHaveLength(1);
    expect(store.get('NSE:INDEX:NIFTY50')?.ltp).toBe(1);
  });

  it('store and bus degrade gracefully (report, never throw) when Redis fails mid-flight', async () => {
    const { handle } = fakeRedis({ failing: true });
    const errors: unknown[] = [];
    const store = new RedisMarketStateStore(handle, 5, 60, (e) => errors.push(e));
    expect(await store.hydrate()).toBe(0);
    store.apply([tick(1, 1)]);
    await new Promise((r) => setTimeout(r, 15));
    expect(store.get('NSE:INDEX:NIFTY50')?.ltp).toBe(1); // local state still authoritative
    const bus = new RedisMessageBus(handle, (e) => errors.push(e));
    await bus.publish('c', { a: 1 });
    expect(errors.length).toBeGreaterThanOrEqual(3);
    store.dispose();
  });
});

describe('Redis implementations', () => {
  it('mirrors state into one coalesced hash write per flush and hydrates it back', async () => {
    const { handle, hash, client } = fakeRedis();
    const store = new RedisMarketStateStore(handle, 5, 60);
    store.apply([tick(1, 1)]);
    store.apply([tick(2, 2)]);
    store.apply([tick(3, 3)]);
    await new Promise((r) => setTimeout(r, 15));
    expect(client.multi).toHaveBeenCalledTimes(1);
    expect(JSON.parse(hash.get('NSE:INDEX:NIFTY50')!).ltp).toBe(3);
    store.dispose();
    const fresh = new RedisMarketStateStore(handle, 5, 60);
    expect(await fresh.hydrate()).toBe(1);
    expect(fresh.get('NSE:INDEX:NIFTY50')?.ltp).toBe(3);
    fresh.dispose();
  });

  it('bus delivers JSON messages to local handlers and unsubscribes when the last one leaves', async () => {
    const { handle, client } = fakeRedis();
    const bus = new RedisMessageBus(handle);
    const seen: unknown[] = [];
    const off = bus.subscribe<{ n: number }>('chan', (m) => seen.push(m));
    await bus.publish('chan', { n: 1 });
    expect(seen).toEqual([{ n: 1 }]);
    expect(client.publish).toHaveBeenCalledWith('chan', '{"n":1}');
    off();
    expect(
      (handle.subscriber as unknown as { unsubscribe: unknown }).unsubscribe,
    ).toHaveBeenCalledWith('chan');
  });

  it('only one instance can hold the feed lease', async () => {
    const { handle } = fakeRedis();
    const a = new RedisFeedLease(handle, 'a', 3_000);
    const b = new RedisFeedLease(handle, 'b', 3_000);
    expect(await a.acquire()).toBe(true);
    expect(await b.acquire()).toBe(false);
    await a.release();
    await b.release();
  });
});
