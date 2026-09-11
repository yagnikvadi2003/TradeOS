import protobuf from 'protobufjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type FeedSocket,
  type FeedTransport,
  type FeedTransportEvents,
  UpstoxAuthError,
} from './upstox-feed.transport';
import { MARKET_DATA_FEED_V3_PROTO } from '../types/proto/market-data-feed-v3.proto';
import { UpstoxMarketFeedProvider } from './upstox-feed.provider';
import { UpstoxSymbolMap } from '../mappers/upstox-symbol-map';

const root = protobuf.parse(MARKET_DATA_FEED_V3_PROTO, { keepCase: true }).root;
const FeedResponse = root.lookupType('com.upstox.marketdatafeederv3udapi.rpc.proto.FeedResponse');

export function encodeFeed(payload: Record<string, unknown>): Uint8Array {
  return FeedResponse.encode(FeedResponse.fromObject(payload)).finish();
}

/** Scripted transport: each connect() consumes the next outcome. */
class FakeTransport implements FeedTransport {
  readonly connects: number[] = [];
  readonly sent: { method: string; keys: string[]; mode: string }[] = [];
  events: FeedTransportEvents | null = null;
  outcomes: ('ok' | 'auth' | 'fail')[] = [];
  open = false;

  connect(events: FeedTransportEvents, timeoutMs: number): Promise<FeedSocket> {
    this.connects.push(timeoutMs);
    const outcome = this.outcomes.shift() ?? 'ok';
    if (outcome === 'auth') return Promise.reject(new UpstoxAuthError(401));
    if (outcome === 'fail') return Promise.reject(new Error('network'));
    this.events = events;
    this.open = true;
    const isOpen = () => this.open;
    const socket: FeedSocket = {
      send: (data) => {
        const req = JSON.parse(data.toString('utf8')) as {
          method: string;
          data: { instrumentKeys: string[]; mode: string };
        };
        this.sent.push({ method: req.method, keys: req.data.instrumentKeys, mode: req.data.mode });
      },
      close: (code = 1000, reason = '') => {
        if (!this.open) return;
        this.open = false;
        events.onClose(code, reason);
      },
      get isOpen() {
        return isOpen();
      },
    };
    return Promise.resolve(socket);
  }

  /** Upstream drops the socket. */
  drop(code = 1006): void {
    this.open = false;
    this.events?.onClose(code, 'dropped');
  }
  frame(bytes: Uint8Array): void {
    this.events?.onMessage(bytes);
  }
  ping(): void {
    this.events?.onPing();
  }
}

function build(transport: FakeTransport, now: () => number) {
  const metrics = {
    counters: {} as Record<string, number>,
    inc(n: string, by = 1) {
      this.counters[n] = (this.counters[n] ?? 0) + by;
    },
    set() {},
  };
  const provider = new UpstoxMarketFeedProvider({
    transport,
    symbols: new UpstoxSymbolMap(),
    mode: 'full',
    maxSubscriptions: 3,
    connectTimeoutMs: 1_000,
    staleAfterMs: 1_000,
    backoff: { initialMs: 100, maxMs: 800, jitter: 0, random: () => 0.5 },
    now,
    metrics,
    flushDelayMs: 0,
    batchSize: 2,
  });
  return { provider, metrics };
}

const flushMicrotasks = () => vi.advanceTimersByTimeAsync(0);

describe('UpstoxMarketFeedProvider', () => {
  beforeEach(() => vi.useFakeTimers({ now: 1_000_000 }));
  afterEach(() => vi.useRealTimers());
  const now = () => Date.now(); // fake-timer clock

  it('connects, maps keys, dedupes and batches upstream subscriptions, unsubscribes on release', async () => {
    const transport = new FakeTransport();
    const { provider, metrics } = build(transport, now);
    const states: string[] = [];
    provider.onStateChange((c) => states.push(c.state));
    await provider.start();
    expect(states).toEqual(['CONNECTING', 'AUTHENTICATING', 'CONNECTED']);
    provider.subscribe([
      'NSE:INDEX:NIFTY50',
      'NSE:INDEX:NIFTY50',
      'NSE:INDEX:BANKNIFTY',
      'BSE:INDEX:SENSEX',
      'NSE:OPT:NIFTY50:2026-09-15:24000:CE',
    ]);
    await flushMicrotasks();
    expect(transport.sent.map((s) => s.method)).toEqual(['sub', 'sub']);
    expect(transport.sent.flatMap((s) => s.keys)).toEqual([
      'NSE_INDEX|Nifty 50',
      'NSE_INDEX|Nifty Bank',
      'BSE_INDEX|SENSEX',
    ]);
    expect(transport.sent[0]?.mode).toBe('full');
    expect(metrics.counters.unmappedSubscriptions).toBe(1); // unknown option contract
    provider.subscribe(['NSE:INDEX:INDIAVIX']); // over the cap of 3
    await flushMicrotasks();
    expect(metrics.counters.subscriptionLimitRejections).toBe(1);
    provider.unsubscribe(['NSE:INDEX:BANKNIFTY']);
    await flushMicrotasks();
    expect(transport.sent.at(-1)).toEqual({
      method: 'unsub',
      keys: ['NSE_INDEX|Nifty Bank'],
      mode: 'full',
    });
    expect(provider.activeUpstreamCount).toBe(2);
    await provider.stop();
    expect(provider.state).toBe('DISCONNECTED');
  });

  it('reconnects with backoff after a provider disconnect and resubscribes everything', async () => {
    const transport = new FakeTransport();
    const { provider, metrics } = build(transport, now);
    await provider.start();
    provider.subscribe(['NSE:INDEX:NIFTY50', 'BSE:INDEX:SENSEX']);
    await flushMicrotasks();
    transport.sent.length = 0;
    transport.outcomes = ['fail', 'ok'];
    transport.drop();
    expect(provider.state).toBe('RECONNECTING');
    await vi.advanceTimersByTimeAsync(100); // first attempt (fails)
    expect(transport.connects).toHaveLength(2);
    expect(provider.state).toBe('RECONNECTING');
    await vi.advanceTimersByTimeAsync(199);
    expect(transport.connects).toHaveLength(2); // still waiting: 200 ms backoff
    await vi.advanceTimersByTimeAsync(1);
    expect(transport.connects).toHaveLength(3);
    expect(provider.state).toBe('CONNECTED');
    expect(transport.sent.flatMap((s) => s.keys).sort()).toEqual([
      'BSE_INDEX|SENSEX',
      'NSE_INDEX|Nifty 50',
    ]);
    expect(metrics.counters.providerReconnects).toBe(2);
    await provider.stop();
  });

  it('waits the maximum delay after an authentication failure (no reconnect storm)', async () => {
    const transport = new FakeTransport();
    transport.outcomes = ['auth', 'auth', 'ok'];
    const { provider, metrics } = build(transport, now);
    const reasons: (string | undefined)[] = [];
    provider.onStateChange((c) => reasons.push(c.reason));
    await provider.start();
    expect(provider.state).toBe('RECONNECTING');
    expect(reasons).toContain('auth_failed');
    await vi.advanceTimersByTimeAsync(799);
    expect(transport.connects).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(transport.connects).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(800);
    expect(provider.state).toBe('CONNECTED');
    expect(metrics.counters.providerAuthFailures).toBe(2);
    await provider.stop();
  });

  it('degrades on silence, forces a reconnect on heartbeat timeout, recovers on frames', async () => {
    const transport = new FakeTransport();
    const { provider, metrics } = build(transport, now);
    await provider.start();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(provider.state).toBe('DEGRADED');
    transport.ping(); // any frame revives it
    expect(provider.state).toBe('CONNECTED');
    await vi.advanceTimersByTimeAsync(2_000);
    expect(provider.state).toBe('RECONNECTING');
    expect(transport.open).toBe(false);
    expect(metrics.counters.staleDataEvents).toBeGreaterThanOrEqual(2);
    await vi.advanceTimersByTimeAsync(100);
    expect(provider.state).toBe('CONNECTED');
    await provider.stop();
  });

  it('isolates malformed frames and normalizes valid ones', async () => {
    const transport = new FakeTransport();
    const { provider, metrics } = build(transport, now);
    const received: unknown[] = [];
    provider.onUpdates((u) => received.push(...u));
    const statuses: unknown[] = [];
    provider.onMarketStatus((s) => statuses.push(s));
    await provider.start();
    transport.frame(new Uint8Array([0xff, 0xff, 0x01, 0x02])); // garbage
    transport.frame(
      encodeFeed({
        type: 'live_feed',
        feeds: { 'NSE_INDEX|Nifty 50': { ltpc: { ltp: -5 } } },
        currentTs: 5,
      }),
    );
    transport.frame(
      encodeFeed({
        type: 'market_info',
        currentTs: 7,
        marketInfo: {
          segmentStatus: {
            NSE_FO: 'NORMAL_OPEN',
            NSE_INDEX: 'PRE_OPEN_START',
            MCX_FO: 'NORMAL_OPEN',
          },
        },
      }),
    );
    transport.frame(
      encodeFeed({
        type: 'live_feed',
        currentTs: 9,
        feeds: {
          'NSE_INDEX|Nifty 50': {
            fullFeed: {
              indexFF: {
                ltpc: { ltp: 24_010.5, cp: 24_000, ltt: 8 },
                marketOHLC: {
                  ohlc: [
                    { interval: '1d', open: 23_990, high: 24_050, low: 23_950, close: 24_010.5 },
                  ],
                },
              },
            },
          },
          'NSE_INDEX|Unknown': { ltpc: { ltp: 1 } },
        },
      }),
    );
    expect(metrics.counters.providerMessages).toBe(4);
    expect(metrics.counters.invalidMessages).toBe(1);
    expect(metrics.counters.unknownFeedKeys).toBe(1);
    expect(statuses).toHaveLength(2);
    expect(received).toHaveLength(2);
    expect(received[1]).toMatchObject({
      kind: 'index',
      instrumentKey: 'NSE:INDEX:NIFTY50',
      ltp: 24_010.5,
      previousClose: 24_000,
      change: 10.5,
      open: 23_990,
      timestamp: 8,
      source: 'live',
    });
    expect(received[0]).toMatchObject({ kind: 'index', ltp: null, previousClose: null });
    await provider.stop();
  });
});
