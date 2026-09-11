import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { type App } from 'supertest/types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  MARKET_STATE_STORE,
  type MarketStateStore,
} from '@/infrastructure/realtime/market-state.store';
import { createTestApp } from '@/tests/create-test-app';

describe('GET /api/v1/market/quotes', () => {
  let app: INestApplication;
  const server = (): App => app.getHttpServer() as App;
  beforeAll(async () => {
    app = await createTestApp();
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });

  it('returns provider snapshots for catalog keys and rejects unknown ones', async () => {
    const res = await request(server())
      .get('/api/v1/market/quotes?instrumentKeys=NSE:INDEX:NIFTY50,NSE:INDEX:INDIAVIX')
      .expect(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0]).toMatchObject({
      instrumentKey: 'NSE:INDEX:NIFTY50',
      source: 'simulated',
    });
    expect(res.headers['cache-control']).toBe('no-store');
    await request(server()).get('/api/v1/market/quotes?instrumentKeys=NSE:INDEX:NOPE').expect(404);
    await request(server()).get('/api/v1/market/quotes?instrumentKeys=bad').expect(400);
  });

  it('prefers the live state store over the provider', async () => {
    const state = app.get<MarketStateStore>(MARKET_STATE_STORE);
    state.apply([
      {
        kind: 'index',
        instrumentKey: 'BSE:INDEX:SENSEX',
        timestamp: Date.now() + 1,
        receivedAt: Date.now(),
        ltp: 80_000,
        previousClose: 79_000,
        open: null,
        high: null,
        low: null,
        change: null,
        changePercent: null,
        volume: null,
        source: 'live',
      },
    ]);
    const res = await request(server())
      .get('/api/v1/market/quotes?instrumentKeys=BSE:INDEX:SENSEX')
      .expect(200);
    expect(res.body.data[0]).toMatchObject({
      ltp: 80_000,
      change: 1000,
      changePercent: 1.27,
      source: 'live',
    });
  });
});
