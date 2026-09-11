import { type INestApplication } from '@nestjs/common';
import { type AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { REALTIME_TOKEN_SERVICE, type RealtimeTokenService } from '@/common/realtime/realtime-auth';
import { type ServerMessage } from '@/common/realtime/ws-messages';
import { MARKET_FEED_PROVIDER } from '@/providers/feed-provider.interface';
import { type MockMarketFeedProvider } from '@/providers/mock/mock-market-feed.provider';
import { createTestApp } from '@/tests/create-test-app';
import { MarketStreamService } from './market-stream.service';

const NIFTY = 'NSE:INDEX:NIFTY50';

class Client {
  readonly ws: WebSocket;
  readonly inbox: ServerMessage[] = [];
  closeCode = 0;
  constructor(url: string, origin = 'http://localhost:5173') {
    this.ws = new WebSocket(url, { headers: { origin } });
    this.ws.on('message', (d: Buffer) =>
      this.inbox.push(JSON.parse(d.toString('utf8')) as ServerMessage),
    );
    this.ws.on('close', (c) => (this.closeCode = c));
  }
  open(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws.once('open', resolve);
      this.ws.once('error', reject);
      this.ws.once('unexpected-response', (_r, res: { statusCode?: number }) => {
        reject(new Error(`HTTP ${String(res.statusCode)}`));
      });
    });
  }
  send(m: unknown): void {
    this.ws.send(JSON.stringify(m));
  }
  async waitFor<T extends ServerMessage['type']>(
    type: T,
    predicate?: (m: Extract<ServerMessage, { type: T }>) => boolean,
    timeoutMs = 3_000,
  ): Promise<Extract<ServerMessage, { type: T }>> {
    const started = Date.now();
    for (;;) {
      const found = this.inbox.find(
        (m): m is Extract<ServerMessage, { type: T }> =>
          m.type === type && (!predicate || predicate(m as never)),
      );
      if (found) return found;
      if (Date.now() - started > timeoutMs)
        throw new Error(
          `timeout waiting for ${type}; got ${this.inbox.map((m) => m.type).join(',')}`,
        );
      await new Promise((r) => setTimeout(r, 15));
    }
  }
  closed(): Promise<number> {
    if (this.ws.readyState === WebSocket.CLOSED) return Promise.resolve(this.closeCode);
    return new Promise((resolve) => this.ws.once('close', resolve));
  }
}

describe('MarketStreamGateway (integration)', () => {
  let app: INestApplication;
  let url: string;
  let tokens: RealtimeTokenService;
  let feed: MockMarketFeedProvider;
  let stream: MarketStreamService;

  beforeAll(async () => {
    app = await createTestApp({
      env: {
        WS_MESSAGES_PER_SECOND: 8,
        WS_MAX_SUBSCRIPTIONS_PER_CLIENT: 5,
        WS_FLUSH_INTERVAL_MS: 30,
      },
    });
    await app.listen(0, '127.0.0.1');
    const server = app.getHttpServer() as { address(): AddressInfo };
    const port = server.address().port;
    url = `ws://127.0.0.1:${port}/ws/market`;
    tokens = app.get(REALTIME_TOKEN_SERVICE);
    feed = app.get(MARKET_FEED_PROVIDER);
    stream = app.get(MarketStreamService);
  });
  afterAll(async () => {
    await app.close();
  });

  const token = () => tokens.issue('user-1', 300).token;

  it('rejects an unknown origin at upgrade', async () => {
    const c = new Client(url, 'https://evil.example');
    await expect(c.open()).rejects.toThrow(/HTTP 403/);
  });

  it('refuses subscriptions before auth and closes on a bad token', async () => {
    const c = new Client(url);
    await c.open();
    c.send({ type: 'subscribe', instruments: [NIFTY] });
    expect((await c.waitFor('error')).code).toBe('UNAUTHENTICATED');
    c.send({ type: 'auth', token: 'not.a.token.at.all' });
    expect((await c.waitFor('error', (m) => m.code === 'AUTH_FAILED')).fatal).toBe(true);
    expect(await c.closed()).toBe(4003);
  });

  it('authenticates, subscribes, receives snapshot then coalesced deltas, and cleans up on disconnect', async () => {
    const a = new Client(url);
    const b = new Client(url);
    await Promise.all([a.open(), b.open()]);
    a.send({ type: 'auth', token: token() });
    b.send({ type: 'auth', token: token() });
    const ack = await a.waitFor('auth');
    expect(ack.ok).toBe(true);
    expect((await a.waitFor('connection_status')).provider).toBe('CONNECTED');
    await b.waitFor('auth');
    await feed.tick(); // nothing subscribed yet → nothing routed
    a.send({ type: 'subscribe', instruments: [NIFTY, 'BSE:INDEX:BANKEX', 'NSE:INDEX:NOPE'] });
    b.send({ type: 'subscribe', instruments: [NIFTY] });
    const sub = await a.waitFor('subscribe');
    expect(sub.instruments).toEqual([NIFTY, 'BSE:INDEX:BANKEX']);
    expect(sub.rejected).toEqual(['NSE:INDEX:NOPE']);
    await b.waitFor('subscribe');
    expect(feed.subscribedKeys).toEqual(new Set([NIFTY, 'BSE:INDEX:BANKEX']));
    expect(stream.registry.refCount(NIFTY)).toBe(2);

    await feed.tick();
    await feed.tick();
    const delta = await a.waitFor('delta');
    expect(
      delta.updates.map((u) => (u.kind === 'index' ? u.instrumentKey : u.contractKey)).sort(),
    ).toEqual(['BSE:INDEX:BANKEX', NIFTY]);
    const bDelta = await b.waitFor('delta');
    expect(bDelta.updates).toHaveLength(1);

    // A newcomer gets current state immediately as a snapshot.
    const c = new Client(url);
    await c.open();
    c.send({ type: 'auth', token: token() });
    await c.waitFor('auth');
    c.send({ type: 'subscribe', instruments: [NIFTY] });
    expect((await c.waitFor('snapshot')).updates).toHaveLength(1);

    a.send({ type: 'unsubscribe', instruments: ['BSE:INDEX:BANKEX'] });
    await a.waitFor('unsubscribe');
    expect(feed.subscribedKeys.has('BSE:INDEX:BANKEX')).toBe(false);

    a.ws.close();
    await a.closed();
    await new Promise((r) => setTimeout(r, 30));
    expect(stream.registry.refCount(NIFTY)).toBe(2); // b and c remain
    b.ws.close();
    c.ws.close();
    await Promise.all([b.closed(), c.closed()]);
    await new Promise((r) => setTimeout(r, 30));
    expect(stream.registry.refCount(NIFTY)).toBe(0);
    expect(feed.subscribedKeys.size).toBe(0);
  });

  it('lets a client reconnect and resubscribe with a fresh session', async () => {
    const first = new Client(url);
    await first.open();
    first.send({ type: 'auth', token: token() });
    const s1 = await first.waitFor('auth');
    first.send({ type: 'subscribe', instruments: [NIFTY] });
    await first.waitFor('subscribe');
    first.ws.terminate();
    await first.closed();
    await new Promise((r) => setTimeout(r, 30));
    expect(stream.registry.refCount(NIFTY)).toBe(0);
    const again = new Client(url);
    await again.open();
    again.send({ type: 'auth', token: token() });
    const s2 = await again.waitFor('auth');
    expect(s2.sessionId).not.toBe(s1.sessionId);
    again.send({ type: 'subscribe', instruments: [NIFTY] });
    await again.waitFor('subscribe');
    expect(stream.registry.refCount(NIFTY)).toBe(1);
    again.ws.close();
    await again.closed();
  });

  it('enforces the per-client subscription cap, message rate and heartbeat echo', async () => {
    const c = new Client(url);
    await c.open();
    c.send({ type: 'auth', token: token() });
    await c.waitFor('auth');
    c.send({ type: 'heartbeat', sentAt: Date.now() - 5 });
    expect((await c.waitFor('heartbeat')).serverTime).toBeGreaterThan(0);
    c.send({
      type: 'subscribe',
      instruments: [
        'NSE:INDEX:NIFTY50',
        'NSE:INDEX:BANKNIFTY',
        'NSE:INDEX:FINNIFTY',
        'NSE:INDEX:INDIAVIX',
        'BSE:INDEX:SENSEX',
        'BSE:INDEX:BANKEX',
      ],
    });
    expect((await c.waitFor('error')).code).toBe('SUBSCRIPTION_LIMIT');
    for (let i = 0; i < 12; i += 1) c.send({ type: 'heartbeat' });
    expect((await c.waitFor('error', (m) => m.code === 'RATE_LIMITED')).fatal).toBe(true);
    expect(await c.closed()).toBe(4008);
  });

  it('rejects oversized frames', async () => {
    const c = new Client(url);
    await c.open();
    c.send({ type: 'auth', token: 'x'.repeat(20_000) });
    expect(await c.closed()).toBe(1009);
  });
});
