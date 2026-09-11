import { describe, expect, it, vi } from 'vitest';
import { InProcessFeedLease } from '@/infrastructure/realtime/feed-lease';
import { InMemoryMarketStateStore } from '@/infrastructure/realtime/market-state.store';
import { InProcessMessageBus } from '@/infrastructure/realtime/message-bus';
import { RealtimeMetrics } from '@/infrastructure/realtime/realtime-metrics';
import { MockMarketFeedProvider } from '@/providers/mock/mock-market-feed.provider';
import { type IndexTick } from './domain/market-update';
import { MarketStreamService } from './market-stream.service';

const NIFTY = 'NSE:INDEX:NIFTY50';
const CE = 'NSE:OPT:NIFTY50:2026-09-15:24000:CE';

async function build() {
  const feed = new MockMarketFeedProvider({ manual: true, now: () => 1_000 });
  const state = new InMemoryMarketStateStore();
  const metrics = new RealtimeMetrics();
  const logger = { error: vi.fn(), warn: vi.fn(), log: vi.fn() };
  const service = new MarketStreamService(
    feed,
    state,
    new InProcessMessageBus(),
    new InProcessFeedLease('i1'),
    metrics,
    logger as never,
  );
  await service.onModuleInit();
  return { feed, state, metrics, service };
}

describe('MarketStreamService', () => {
  it('starts the feed as lease holder and subscribes upstream once per key across clients', async () => {
    const { feed, service, metrics } = await build();
    expect(feed.state).toBe('CONNECTED');
    const a = service.subscribe('a', [NIFTY, CE], ['*']);
    const b = service.subscribe('b', [NIFTY], ['*']);
    service.subscribe('c', [NIFTY], ['*']);
    expect(a.accepted).toEqual([NIFTY, CE]);
    expect(b.rejected).toEqual([]);
    expect(feed.subscribedKeys).toEqual(new Set([NIFTY, CE]));
    expect(service.registry.refCount(NIFTY)).toBe(3);
    expect(metrics.snapshot().activeSubscriptions).toBe(4);
    service.unsubscribe('a', [NIFTY]);
    service.removeClient('b');
    expect(feed.subscribedKeys.has(NIFTY)).toBe(true); // c still wants it
    service.removeClient('c');
    expect(feed.subscribedKeys).toEqual(new Set([CE]));
    expect(a.snapshot).toEqual([]);
    await service.onModuleDestroy();
    expect(feed.state).toBe('DISCONNECTED');
  });

  it('authorizes keys against the catalog and the session scope', async () => {
    const { service } = await build();
    const r = service.subscribe(
      'a',
      [
        'NSE:INDEX:INDIAVIX', // volatility index: allowed as an index stream
        'NSE:OPT:INDIAVIX:2026-09-15:14:CE', // no option chain
        'NSE:INDEX:NOPE',
        'garbage',
        CE,
      ],
      ['*'],
    );
    expect(r.accepted).toEqual(['NSE:INDEX:INDIAVIX', CE]);
    expect(r.rejected).toEqual(['NSE:OPT:INDIAVIX:2026-09-15:14:CE', 'NSE:INDEX:NOPE', 'garbage']);
    const scoped = service.subscribe('b', [NIFTY, CE], [CE]);
    expect(scoped.accepted).toEqual([CE]);
    await service.onModuleDestroy();
  });

  it('applies updates to state, fans out to listeners, serves snapshots, drops invalid and stale ticks', async () => {
    const { feed, service, state, metrics } = await build();
    const received: unknown[][] = [];
    service.onUpdates((u) => received.push([...u]));
    service.subscribe('a', [NIFTY], ['*']);
    const tick = (ltp: number, timestamp: number): IndexTick => ({
      kind: 'index',
      instrumentKey: NIFTY,
      timestamp,
      receivedAt: timestamp,
      ltp,
      previousClose: 24_000,
      open: null,
      high: null,
      low: null,
      change: null,
      changePercent: null,
      volume: null,
      source: 'simulated',
    });
    await feed.tick([tick(24_010, 10)]);
    await feed.tick([tick(24_005, 5)]); // older than stored: ignored
    await feed.tick([{ ...tick(24_020, 20), ltp: Number.NaN }]); // invalid: dropped
    expect(received).toHaveLength(1);
    expect(state.get(NIFTY)?.ltp).toBe(24_010);
    expect(metrics.snapshot().invalidMessages).toBe(1);
    expect(metrics.snapshot().normalizedMessages).toBe(2);
    const late = service.subscribe('b', [NIFTY], ['*']);
    expect(late.snapshot[0]?.ltp).toBe(24_010);
    await service.onModuleDestroy();
  });

  it('reflects provider state and market status', async () => {
    const { feed, service } = await build();
    const statuses: unknown[] = [];
    service.onStatus((s) => statuses.push(s));
    expect(service.status.provider).toBe('CONNECTED');
    expect(service.status.markets[0]).toMatchObject({ exchangeCode: 'NSE', status: 'NORMAL_OPEN' });
    feed.simulateDisconnect();
    expect(service.status.provider).toBe('RECONNECTING');
    expect(service.status.stale).toBe(true);
    expect(statuses.length).toBeGreaterThan(0);
    await service.onModuleDestroy();
  });
});
