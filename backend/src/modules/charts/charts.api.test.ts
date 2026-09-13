import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { type App } from 'supertest/types';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { MockMarketDataProvider } from '@/providers/mock/mock-market-data.provider';
import { createTestApp } from '@/tests/create-test-app';
import { FIXED_NOW } from '@/tests/fakes';

describe('GET /api/v1/charts/:instrument/candles and /api/v1/instruments', () => {
  let app: INestApplication;
  const provider = new MockMarketDataProvider({ now: () => FIXED_NOW, strikesEachSide: 2 });
  const server = (): App => app.getHttpServer() as App;
  beforeAll(async () => {
    app = await createTestApp({ provider });
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });

  it('returns ordered, well-formed candles and caches per interval', async () => {
    const spy = vi.spyOn(provider, 'getCandles');
    const res = await request(server())
      .get('/api/v1/charts/NSE:INDEX:NIFTY50/candles?interval=5m&limit=50')
      .expect(200);
    const candles = res.body.data.candles as {
      time: number;
      open: number;
      high: number;
      low: number;
      close: number;
    }[];
    expect(candles).toHaveLength(50);
    expect(res.body.data.source).toBe('simulated');
    for (let i = 1; i < candles.length; i += 1)
      expect(candles[i]!.time - candles[i - 1]!.time).toBe(300);
    for (const c of candles) {
      expect(c.high).toBeGreaterThanOrEqual(Math.max(c.open, c.close));
      expect(c.low).toBeLessThanOrEqual(Math.min(c.open, c.close));
    }
    expect(candles.at(-1)!.time % 300).toBe(0);
    await request(server())
      .get('/api/v1/charts/NSE:INDEX:NIFTY50/candles?interval=5m&limit=20')
      .expect(200);
    expect(spy).toHaveBeenCalledTimes(1); // second call served from cache
    await request(server())
      .get('/api/v1/charts/NSE:INDEX:INDIAVIX/candles?interval=1d')
      .expect(200);
  });

  it('validates interval, limit and instrument', async () => {
    await request(server()).get('/api/v1/charts/NSE:INDEX:NIFTY50/candles?interval=2m').expect(400);
    await request(server()).get('/api/v1/charts/NSE:INDEX:NIFTY50/candles?limit=5').expect(400);
    await request(server()).get('/api/v1/charts/NSE:INDEX:NOPE/candles').expect(404);
  });

  it('lists the six instruments with correct option-chain capability', async () => {
    const res = await request(server()).get('/api/v1/instruments').expect(200);
    expect(res.body.data).toHaveLength(6);
    const list = res.body.data as {
      symbol: string;
      capabilities: { optionChain: boolean };
      lotSize: number | null;
    }[];
    const vix = list.find((i) => i.symbol === 'INDIAVIX')!;
    expect(vix.capabilities.optionChain).toBe(false);
    expect(vix.lotSize).toBeNull();
    const oc = await request(server()).get('/api/v1/instruments?optionChain=true').expect(200);
    expect((oc.body.data as { symbol: string }[]).map((i) => i.symbol)).toEqual([
      'NIFTY50',
      'BANKNIFTY',
      'FINNIFTY',
      'SENSEX',
      'BANKEX',
    ]);
    const bse = await request(server()).get('/api/v1/instruments?exchange=BSE').expect(200);
    expect(bse.body.data).toHaveLength(2);
    await request(server()).get('/api/v1/instruments?exchange=MCX').expect(400);
  });
});
