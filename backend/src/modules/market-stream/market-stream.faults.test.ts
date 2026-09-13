import { describe, expect, it, vi } from 'vitest';
import { InProcessFeedLease } from '@/infrastructure/realtime/feed-lease';
import { InMemoryMarketStateStore } from '@/infrastructure/realtime/market-state.store';
import { InProcessMessageBus } from '@/infrastructure/realtime/message-bus';
import { RealtimeMetrics } from '@/infrastructure/realtime/realtime-metrics';
import { MockMarketFeedProvider } from '@/providers/mock/mock-market-feed.provider';
import { MarketStreamService } from './market-stream.service';

const NIFTY = 'NSE:INDEX:NIFTY50';
const CE = 'NSE:OPT:NIFTY50:2026-09-15:24000:CE';

async function build() {
  let now = 1_000_000;
  const feed = new MockMarketFeedProvider({ manual: true, now: () => now });
  const state = new InMemoryMarketStateStore();
  const metrics = new RealtimeMetrics();
  const service = new MarketStreamService(
    feed,
    state,
    new InProcessMessageBus(),
    new InProcessFeedLease('i1'),
    metrics,
    { error: vi.fn(), warn: vi.fn(), log: vi.fn() } as never,
  );
  await service.onModuleInit();
  const delivered: unknown[][] = [];
  service.onUpdates((u) => delivered.push([...u]));
  const statuses: string[] = [];
  service.onStatus((s) => statuses.push(`${s.provider}:${s.stale}`));
  service.subscribe('a', [NIFTY, CE], ['*']);
  return {
    feed,
    state,
    metrics,
    service,
    delivered,
    statuses,
    advance: (ms: number) => (now += ms),
  };
}

/**
 * Provider simulator scenarios: each hook mimics a failure a real feed can
 * produce; the assertions pin the pipeline's contract for it.
 */
describe('provider simulator scenarios', () => {
  it('malformed payloads are dropped and counted, valid siblings still flow', async () => {
    const { feed, delivered, metrics, service } = await build();
    await feed.tick();
    feed.emitRaw([{ kind: 'index', instrumentKey: NIFTY, ltp: 'NaN' }, { nonsense: true }, null]);
    expect(metrics.snapshot().invalidMessages).toBe(3);
    expect(delivered).toHaveLength(1);
    await service.onModuleDestroy();
  });

  it('duplicate frames do not produce duplicate fanout', async () => {
    const { feed, delivered, service, metrics } = await build();
    await feed.simulateDuplicate();
    expect(delivered).toHaveLength(1); // second copy is not newer → state unchanged → nothing to route
    expect(metrics.snapshot().normalizedMessages).toBe(4); // both copies were valid
    await service.onModuleDestroy();
  });

  it('stale (older) updates never regress state', async () => {
    const { feed, state, delivered, service } = await build();
    await feed.tick();
    const before = state.get(NIFTY)?.timestamp;
    await feed.simulateStale(60_000);
    expect(state.get(NIFTY)?.timestamp).toBe(before);
    expect(delivered).toHaveLength(1);
    await service.onModuleDestroy();
  });

  it('delayed data is accepted but carries its receipt lag', async () => {
    const { feed, state, service } = await build();
    await feed.simulateDelayed(5_000);
    const tick = state.get(NIFTY)!;
    expect(tick.receivedAt - tick.timestamp).toBeGreaterThanOrEqual(5_000);
    await service.onModuleDestroy();
  });

  it('a burst collapses to one state per key and one fanout per batch', async () => {
    const { feed, state, delivered, service } = await build();
    await feed.simulateBurst(200);
    expect(delivered).toHaveLength(200); // service fans out per batch; the router coalesces per client
    const last = state.get(NIFTY)!;
    expect(last.timestamp).toBe(
      Math.max(...delivered.map((b) => (b[0] as { timestamp: number }).timestamp)),
    );
    await service.onModuleDestroy();
  });

  it('disconnect → reconnect → silence → heartbeat timeout are all surfaced as status', async () => {
    const { feed, statuses, service, delivered } = await build();
    feed.simulateDisconnect();
    expect(service.status).toMatchObject({ provider: 'RECONNECTING', stale: true });
    await feed.tick(); // nothing flows while reconnecting
    expect(delivered).toHaveLength(0);
    feed.simulateReconnect();
    expect(service.status).toMatchObject({ provider: 'CONNECTED', stale: false });
    await feed.tick();
    expect(delivered).toHaveLength(1);
    feed.simulateSilence();
    expect(service.status.provider).toBe('DEGRADED');
    feed.simulateHeartbeatTimeout();
    expect(service.status.provider).toBe('RECONNECTING');
    expect(statuses).toEqual([
      'RECONNECTING:true',
      'CONNECTING:true',
      'AUTHENTICATING:true',
      'CONNECTED:false',
      'DEGRADED:true',
      'RECONNECTING:true',
    ]);
    await service.onModuleDestroy();
  });

  it('provider failure at start is reported, not fatal', async () => {
    const feed = new MockMarketFeedProvider({ manual: true });
    vi.spyOn(feed, 'start').mockRejectedValueOnce(new Error('auth failed'));
    const logger = { error: vi.fn(), warn: vi.fn(), log: vi.fn() };
    const service = new MarketStreamService(
      feed,
      new InMemoryMarketStateStore(),
      new InProcessMessageBus(),
      new InProcessFeedLease('i1'),
      new RealtimeMetrics(),
      logger as never,
    );
    await expect(service.onModuleInit()).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: 'auth failed' }),
      expect.any(String),
    );
    expect(service.subscribe('a', [NIFTY], ['*']).accepted).toEqual([NIFTY]); // clients still admitted
    await service.onModuleDestroy();
  });
});
