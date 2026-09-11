import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RealtimeMetrics } from '@/infrastructure/realtime/realtime-metrics';
import { SubscriptionRegistry } from '@/infrastructure/realtime/subscription-registry';
import { type ServerMessage } from '@/common/realtime/ws-messages';
import { type IndexTick } from './domain/market-update';
import { MarketDataRouter } from './market-data.router';

function tick(key: string, ltp: number, ts = 1): IndexTick {
  return {
    kind: 'index',
    instrumentKey: key as never,
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
    source: 'simulated',
  };
}

describe('MarketDataRouter', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function client(id: string, buffered = 0) {
    const sent: ServerMessage[] = [];
    return {
      id,
      sent,
      bufferedBytes: () => buffered,
      send: (m: ServerMessage) => void sent.push(m),
    };
  }

  it('fans out only to subscribers and coalesces per key within a window', () => {
    const registry = new SubscriptionRegistry();
    const router = new MarketDataRouter(registry, new RealtimeMetrics(), { flushIntervalMs: 100 });
    const a = client('a');
    const b = client('b');
    router.attach(a);
    router.attach(b);
    registry.subscribe('a', ['NSE:INDEX:NIFTY50']);
    registry.subscribe('b', ['BSE:INDEX:SENSEX']);
    for (let i = 1; i <= 50; i += 1) router.route([tick('NSE:INDEX:NIFTY50', 24_000 + i, i)]);
    router.route([tick('BSE:INDEX:SENSEX', 79_000)]);
    expect(a.sent).toHaveLength(0);
    vi.advanceTimersByTime(100);
    expect(a.sent).toHaveLength(1);
    const delta = a.sent[0] as { type: 'delta'; updates: IndexTick[] };
    expect(delta.updates).toHaveLength(1);
    expect(delta.updates[0]?.ltp).toBe(24_050); // latest state, not 50 messages
    expect(b.sent).toHaveLength(1);
    const bDelta = b.sent[0] as { type: 'delta'; updates: IndexTick[] };
    expect(bDelta.updates[0]?.instrumentKey).toBe('BSE:INDEX:SENSEX');
  });

  it('holds deltas for a client whose socket is backed up, without unbounded growth', () => {
    const registry = new SubscriptionRegistry();
    const metrics = new RealtimeMetrics();
    const router = new MarketDataRouter(registry, metrics, {
      flushIntervalMs: 50,
      maxPendingKeys: 2,
      backpressureBytes: 1_000,
    });
    const slow = client('slow', 5_000);
    router.attach(slow);
    registry.subscribe('slow', ['K1', 'K2', 'K3']);
    router.route([tick('K1', 1), tick('K2', 2), tick('K3', 3)]);
    vi.advanceTimersByTime(60);
    expect(slow.sent).toHaveLength(0);
    expect(metrics.counter('backpressureSkips')).toBeGreaterThan(0);
    // Peer drains: next flush sends the (bounded) latest state and reports the drop.
    slow.bufferedBytes = () => 0;
    vi.advanceTimersByTime(60);
    expect(slow.sent).toHaveLength(1);
    const delta = slow.sent[0] as { type: 'delta'; updates: unknown[]; dropped?: number };
    expect(delta.updates).toHaveLength(2);
    expect(delta.dropped).toBe(1);
    expect(metrics.counter('droppedMessages')).toBe(1);
  });

  it('stops routing to a detached client', () => {
    const registry = new SubscriptionRegistry();
    const router = new MarketDataRouter(registry, new RealtimeMetrics(), { flushIntervalMs: 10 });
    const a = client('a');
    router.attach(a);
    registry.subscribe('a', ['K1']);
    router.detach('a');
    router.route([tick('K1', 1)]);
    vi.advanceTimersByTime(20);
    expect(a.sent).toHaveLength(0);
  });
});
