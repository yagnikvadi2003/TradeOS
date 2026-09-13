import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { type App } from 'supertest/types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MARKET_FEED_PROVIDER } from '@/providers/feed-provider.interface';
import { type MockMarketFeedProvider } from '@/providers/mock/mock-market-feed.provider';
import { MarketStreamService } from '@/modules/market-stream/market-stream.service';
import { createTestApp } from '@/tests/create-test-app';

const CSRF = { 'X-Requested-With': 'TradeOS' };

describe('session-owned features: watchlists, alerts, notifications, preferences, calendar', () => {
  let app: INestApplication;
  let cookie: string;
  let feed: MockMarketFeedProvider;
  let stream: MarketStreamService;
  const server = (): App => app.getHttpServer() as App;
  const as = (c = cookie) => ({ Cookie: c, ...CSRF });

  beforeAll(async () => {
    app = await createTestApp();
    await app.init();
    feed = app.get(MARKET_FEED_PROVIDER);
    stream = app.get(MarketStreamService);
    const res = await request(server()).get('/api/v1/session').expect(200);
    cookie = (res.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
    expect(cookie).toMatch(/^tradeos_sid=/);
    expect((res.headers['set-cookie'] as unknown as string[])[0]).toContain('HttpOnly');
  });
  afterAll(async () => {
    await app.close();
  });

  it('rejects forged cookies, missing CSRF header, and unauthenticated access', async () => {
    await request(server()).get('/api/v1/watchlists').expect(401);
    await request(server())
      .get('/api/v1/watchlists')
      .set('Cookie', 'tradeos_sid=00000000-0000-0000-0000-000000000000.forged')
      .expect(401);
    await request(server())
      .post('/api/v1/watchlists')
      .set('Cookie', cookie)
      .send({ name: 'x' })
      .expect(401);
  });

  it('watchlists: create, add/remove items, rename, limits, isolation between sessions', async () => {
    const created = await request(server())
      .post('/api/v1/watchlists')
      .set(as())
      .send({ name: 'Core' })
      .expect(201);
    const id = created.body.data.id as string;
    await request(server()).post('/api/v1/watchlists').set(as()).send({ name: 'Core' }).expect(409);
    await request(server())
      .post(`/api/v1/watchlists/${id}/items`)
      .set(as())
      .send({ instrumentKey: 'NSE:INDEX:NIFTY50' })
      .expect(201);
    await request(server())
      .post(`/api/v1/watchlists/${id}/items`)
      .set(as())
      .send({ instrumentKey: 'NSE:INDEX:NOPE' })
      .expect(400);
    const dup = await request(server())
      .post(`/api/v1/watchlists/${id}/items`)
      .set(as())
      .send({ instrumentKey: 'NSE:INDEX:NIFTY50' })
      .expect(201);
    expect(dup.body.data.items).toHaveLength(1);
    await request(server())
      .patch(`/api/v1/watchlists/${id}`)
      .set(as())
      .send({ name: 'Core 2' })
      .expect(200);
    await request(server())
      .delete(`/api/v1/watchlists/${id}/items/NSE:INDEX:NIFTY50`)
      .set(as())
      .expect(200);
    // Another session cannot see or touch it.
    const other = (await request(server()).get('/api/v1/session').expect(200)).headers[
      'set-cookie'
    ] as unknown as string[];
    const otherCookie = other[0]!.split(';')[0]!;
    const list = await request(server()).get('/api/v1/watchlists').set(as(otherCookie)).expect(200);
    expect(list.body.data).toEqual([]);
    await request(server())
      .patch(`/api/v1/watchlists/${id}`)
      .set(as(otherCookie))
      .send({ name: 'hijack' })
      .expect(404);
    await request(server()).delete(`/api/v1/watchlists/${id}`).set(as()).expect(200);
  });

  it('alerts: creation subscribes the engine upstream, trigger produces a notification, delete releases', async () => {
    expect(stream.registry.refCount('BSE:INDEX:SENSEX')).toBe(0);
    const created = await request(server())
      .post('/api/v1/alerts')
      .set(as())
      .send({
        instrumentKey: 'BSE:INDEX:SENSEX',
        condition: 'PRICE_ABOVE',
        threshold: 1,
        note: 'ping',
      })
      .expect(201);
    expect(stream.registry.refCount('BSE:INDEX:SENSEX')).toBe(1);
    expect(feed.subscribedKeys.has('BSE:INDEX:SENSEX')).toBe(true);
    await request(server())
      .post('/api/v1/alerts')
      .set(as())
      .send({ instrumentKey: 'NSE:INDEX:NIFTY50', condition: 'IV_ABOVE', threshold: 1 })
      .expect(400);
    await feed.tick(); // SENSEX ≈ 79k ≥ 1 → fires
    await new Promise((r) => setTimeout(r, 20));
    const alerts = await request(server()).get('/api/v1/alerts').set(as()).expect(200);
    expect(alerts.body.data[0]).toMatchObject({ id: created.body.data.id, status: 'TRIGGERED' });
    expect(stream.registry.refCount('BSE:INDEX:SENSEX')).toBe(0); // one-shot alert released its key
    const inbox = await request(server()).get('/api/v1/notifications').set(as()).expect(200);
    expect(inbox.body.data).toHaveLength(1);
    expect(inbox.body.data[0]).toMatchObject({
      alertId: created.body.data.id,
      body: 'ping',
      readAt: null,
    });
    const marked = await request(server())
      .post('/api/v1/notifications/read')
      .set(as())
      .send({ ids: 'all' })
      .expect(201);
    expect(marked.body.data.marked).toBe(1);
    await request(server()).delete(`/api/v1/alerts/${created.body.data.id}`).set(as()).expect(200);
  });

  it('preferences: merge known keys, reject unknown', async () => {
    await request(server())
      .put('/api/v1/preferences')
      .set(as())
      .send({ theme: 'dark', optionChain: { strikeWindow: 20, columnPreset: 'greeks' } })
      .expect(200);
    const got = await request(server()).get('/api/v1/preferences').set(as()).expect(200);
    expect(got.body.data).toEqual({
      theme: 'dark',
      optionChain: { strikeWindow: 20, columnPreset: 'greeks' },
    });
    await request(server()).put('/api/v1/preferences').set(as()).send({ bogus: 1 }).expect(400);
  });

  it('market calendar: schedule and today’s state without guessing holidays', async () => {
    const res = await request(server()).get('/api/v1/market-calendar?exchange=NSE').expect(200);
    expect(res.body.data.schedule).toEqual({
      openMinutes: 555,
      closeMinutes: 930,
      timezone: 'Asia/Kolkata',
    });
    expect(['PRE_OPEN', 'OPEN', 'CLOSED', 'HOLIDAY', 'SPECIAL_SESSION']).toContain(
      res.body.data.today.state,
    );
    expect(res.body.data.days).toEqual([]);
    await request(server()).get('/api/v1/market-calendar?exchange=MCX').expect(400);
  });

  it('realtime token is session-bound when the cookie is present', async () => {
    const res = await request(server())
      .get('/api/v1/realtime/token')
      .set('Cookie', cookie)
      .expect(200);
    const payload = JSON.parse(
      Buffer.from((res.body.data.token as string).split('.')[1]!, 'base64url').toString(),
    );
    expect(payload.sub).toMatch(/^session:/);
  });
});
