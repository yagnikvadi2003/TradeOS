import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type StreamSocket, WsMarketStream } from './market-stream';
import { type MarketUpdate } from './market-stream.messages';

class FakeSocket implements StreamSocket {
  static instances: FakeSocket[] = [];
  readyState = 0;
  sent: Record<string, unknown>[] = [];
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: { code: number; reason: string }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  constructor(readonly url: string) {
    FakeSocket.instances.push(this);
  }
  send(data: string): void {
    this.sent.push(JSON.parse(data) as Record<string, unknown>);
  }
  close(code = 1000, reason = ''): void {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.onclose?.({ code, reason });
  }
  open(): void {
    this.readyState = 1;
    this.onopen?.({});
  }
  receive(message: unknown): void {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
  /** Server drops the connection. */
  drop(code = 1006): void {
    this.readyState = 3;
    this.onclose?.({ code, reason: 'lost' });
  }
}

const tick = (ltp: number, ts: number): MarketUpdate => ({
  kind: 'index',
  instrumentKey: 'NSE:INDEX:NIFTY50',
  timestamp: ts,
  receivedAt: ts,
  ltp,
  previousClose: 24_000,
  open: null,
  high: null,
  low: null,
  change: null,
  changePercent: null,
  volume: null,
  source: 'live',
});

function build() {
  FakeSocket.instances = [];
  const getToken = vi.fn(() => Promise.resolve('session-token-1234567890'));
  const stream = new WsMarketStream({
    url: 'ws://test/ws/market',
    getToken,
    socketFactory: (url) => new FakeSocket(url),
    heartbeatIntervalMs: 1_000,
    heartbeatTimeoutMs: 500,
    backoff: { initialMs: 100, maxMs: 800, jitter: 0, random: () => 0.5 },
    idleCloseMs: 200,
  });
  const states: string[] = [];
  stream.onInfo((i) => states.push(i.state));
  const updates: MarketUpdate[] = [];
  stream.onUpdates((u) => updates.push(...u));
  return { stream, getToken, states, updates, socket: () => FakeSocket.instances.at(-1)! };
}

async function handshake(socket: FakeSocket) {
  socket.open();
  await vi.advanceTimersByTimeAsync(0); // token promise
  socket.receive({ type: 'auth', ok: true, sessionId: 's1', expiresAt: 9e12 });
}

describe('WsMarketStream', () => {
  beforeEach(() => vi.useFakeTimers({ now: 1_000_000 }));
  afterEach(() => vi.useRealTimers());

  it('authenticates before subscribing, refcounts keys, and validates inbound frames', async () => {
    const { stream, states, updates, socket, getToken } = build();
    const releaseA = stream.subscribe(['NSE:INDEX:NIFTY50', 'BSE:INDEX:SENSEX']);
    const releaseB = stream.subscribe(['NSE:INDEX:NIFTY50']);
    expect(states).toEqual(['connecting']);
    expect(socket().sent).toEqual([]); // nothing before auth
    await handshake(socket());
    expect(getToken).toHaveBeenCalledTimes(1);
    expect(socket().sent[0]).toEqual({ type: 'auth', token: 'session-token-1234567890' });
    expect(socket().sent[1]).toEqual({
      type: 'subscribe',
      instruments: ['NSE:INDEX:NIFTY50', 'BSE:INDEX:SENSEX'],
    });
    expect(stream.info.state).toBe('connected');
    socket().receive({
      type: 'subscribe',
      ok: true,
      instruments: ['NSE:INDEX:NIFTY50', 'BSE:INDEX:SENSEX'],
      rejected: [],
    });
    socket().receive({ type: 'delta', updates: [tick(24_010, 5)] });
    socket().receive({
      type: 'delta',
      updates: [{ kind: 'index', instrumentKey: 'X', ltp: 'nope' }],
    });
    socket().receive('not json');
    expect(updates).toHaveLength(1);
    releaseA();
    await vi.advanceTimersByTimeAsync(0);
    expect(socket().sent.at(-1)).toEqual({
      type: 'unsubscribe',
      instruments: ['BSE:INDEX:SENSEX'],
    });
    releaseB();
    await vi.advanceTimersByTimeAsync(0);
    expect(socket().sent.at(-1)).toEqual({
      type: 'unsubscribe',
      instruments: ['NSE:INDEX:NIFTY50'],
    });
    await vi.advanceTimersByTimeAsync(200); // idle close
    expect(stream.info.state).toBe('idle');
    expect(socket().readyState).toBe(3);
  });

  it('cancels out release+retain of shared keys inside one task (no upstream flap)', async () => {
    const { stream, socket } = build();
    const release = stream.subscribe(['NSE:INDEX:NIFTY50', 'K1']);
    await handshake(socket());
    socket().receive({
      type: 'subscribe',
      ok: true,
      instruments: ['NSE:INDEX:NIFTY50', 'K1'],
      rejected: [],
    });
    const before = socket().sent.length;
    release();
    stream.subscribe(['NSE:INDEX:NIFTY50', 'K2']); // window change: K1 out, K2 in, NIFTY stays
    await vi.advanceTimersByTimeAsync(0);
    const frames = socket().sent.slice(before);
    expect(frames).toEqual([
      { type: 'unsubscribe', instruments: ['K1'] },
      { type: 'subscribe', instruments: ['K2'] },
    ]);
  });

  it('reconnects with backoff after a drop and resubscribes retained keys', async () => {
    const { stream, states, socket } = build();
    stream.subscribe(['NSE:INDEX:NIFTY50']);
    await handshake(socket());
    socket().receive({
      type: 'subscribe',
      ok: true,
      instruments: ['NSE:INDEX:NIFTY50'],
      rejected: [],
    });
    const first = socket();
    first.drop();
    expect(stream.info.state).toBe('reconnecting');
    expect(FakeSocket.instances).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(100);
    expect(FakeSocket.instances).toHaveLength(2);
    const second = socket();
    expect(second).not.toBe(first);
    await handshake(second);
    expect(second.sent[1]).toEqual({ type: 'subscribe', instruments: ['NSE:INDEX:NIFTY50'] });
    expect(stream.info.state).toBe('connected');
    expect(stream.info.reconnectAttempt).toBe(0);
    expect(states).toContain('reconnecting');
  });

  it('measures heartbeat latency and reconnects when the server stops answering', async () => {
    const { stream, socket } = build();
    stream.subscribe(['NSE:INDEX:NIFTY50']);
    await handshake(socket());
    await vi.advanceTimersByTimeAsync(1_000);
    const hb = socket().sent.find((m) => m.type === 'heartbeat')!;
    socket().receive({ type: 'heartbeat', serverTime: 1, sentAt: (hb.sentAt as number) - 40 });
    expect(stream.info.latencyMs).toBe(40);
    await vi.advanceTimersByTimeAsync(1_000); // next heartbeat, never answered
    await vi.advanceTimersByTimeAsync(500);
    expect(stream.info.state).toBe('reconnecting');
  });

  it('mirrors provider status as degraded and surfaces the state to subscribers', async () => {
    const { stream, socket } = build();
    stream.subscribe(['NSE:INDEX:NIFTY50']);
    await handshake(socket());
    socket().receive({ type: 'connection_status', provider: 'DEGRADED', stale: true });
    expect(stream.info.state).toBe('degraded');
    expect(stream.info.provider).toBe('DEGRADED');
    socket().receive({ type: 'connection_status', provider: 'CONNECTED', stale: false });
    expect(stream.info.state).toBe('connected');
    stream.disconnect();
    expect(stream.info.state).toBe('disconnected');
    expect(socket().readyState).toBe(3);
  });

  it('backs off fully after an authentication rejection', async () => {
    const { stream, socket } = build();
    stream.subscribe(['NSE:INDEX:NIFTY50']);
    socket().open();
    await vi.advanceTimersByTimeAsync(0);
    socket().receive({ type: 'error', code: 'AUTH_FAILED', message: 'bad', fatal: true });
    socket().drop(4003);
    expect(stream.info.state).toBe('reconnecting');
    await vi.advanceTimersByTimeAsync(799);
    expect(FakeSocket.instances).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(FakeSocket.instances).toHaveLength(2);
  });
});
