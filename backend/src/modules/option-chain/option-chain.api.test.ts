import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { type App } from 'supertest/types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MockMarketDataProvider } from '@/providers/mock/mock-market-data.provider';
import { createTestApp } from '@/tests/create-test-app';
import {
  expiriesResponseSchema,
  metadataResponseSchema,
  snapshotResponseSchema,
} from './dto/option-chain.response';

const NIFTY = encodeURIComponent('NSE:INDEX:NIFTY50');
let app: INestApplication;
const server = (): App => app.getHttpServer() as App;

describe('GET /api/v1/option-chain', () => {
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('returns metadata for an option-chain instrument', async () => {
    const res = await request(server()).get(`/api/v1/option-chain/${NIFTY}`).expect(200);
    const parsed = metadataResponseSchema.parse(res.body);
    expect(parsed.data).toMatchObject({
      instrumentKey: 'NSE:INDEX:NIFTY50',
      lotSize: 75,
      strikeStep: 50,
    });
    expect(parsed.data.nearestExpiry).toBe(parsed.data.expiries[0]?.expiryDate);
    expect(res.headers['cache-control']).toBe('private, max-age=60');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('lists expiries', async () => {
    const res = await request(server()).get(`/api/v1/option-chain/${NIFTY}/expiries`).expect(200);
    const parsed = expiriesResponseSchema.parse(res.body);
    expect(parsed.data.length).toBeGreaterThan(3);
    expect(parsed.meta.version).toBe('v1');
  });

  it('returns a normalized snapshot for the nearest expiry with no provider structures', async () => {
    const res = await request(server()).get(`/api/v1/option-chain/${NIFTY}/snapshot`).expect(200);
    const parsed = snapshotResponseSchema.parse(res.body);
    expect(parsed.data.strikes).toHaveLength(21);
    expect(parsed.data.source).toBe('simulated');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(JSON.stringify(res.body)).not.toMatch(/upstox|instrument_token|last_price/i);
  });

  it('honours the expiry query and validates it', async () => {
    const expiries = expiriesResponseSchema.parse(
      (await request(server()).get(`/api/v1/option-chain/${NIFTY}/expiries`)).body,
    ).data;
    const target = expiries[1]!.expiryDate;
    const ok = await request(server())
      .get(`/api/v1/option-chain/${NIFTY}/snapshot?expiry=${target}`)
      .expect(200);
    expect(snapshotResponseSchema.parse(ok.body).data.expiry.expiryDate).toBe(target);

    const bad = await request(server())
      .get(`/api/v1/option-chain/${NIFTY}/snapshot?expiry=15-09-2026`)
      .expect(400);
    expect(bad.body.error.code).toBe('VALIDATION_FAILED');
    expect(bad.body.error.details.issues[0].path).toBe('expiry');

    const missing = await request(server())
      .get(`/api/v1/option-chain/${NIFTY}/snapshot?expiry=2031-01-07`)
      .expect(404);
    expect(missing.body.error.code).toBe('EXPIRY_NOT_FOUND');
  });

  it('refuses INDIA VIX with OPTION_CHAIN_NOT_SUPPORTED', async () => {
    const res = await request(server())
      .get(`/api/v1/option-chain/${encodeURIComponent('NSE:INDEX:INDIAVIX')}`)
      .expect(404);
    expect(res.body.error.code).toBe('OPTION_CHAIN_NOT_SUPPORTED');
  });

  it('rejects malformed and unknown instrument keys', async () => {
    const bad = await request(server()).get('/api/v1/option-chain/NIFTY').expect(400);
    expect(bad.body.error.code).toBe('VALIDATION_FAILED');
    const unknown = await request(server())
      .get(`/api/v1/option-chain/${encodeURIComponent('NSE:INDEX:NOPE')}`)
      .expect(404);
    expect(unknown.body.error.code).toBe('INSTRUMENT_NOT_FOUND');
  });

  it('exposes liveness and readiness without a database', async () => {
    await request(server()).get('/health/live').expect(200, { status: 'ok' });
    const ready = await request(server()).get('/health/ready').expect(200);
    expect(ready.body.checks.database).toBe('disabled');
  });
});

describe('provider outage', () => {
  it('maps provider failures to 503 PROVIDER_UNAVAILABLE', async () => {
    app = await createTestApp({
      provider: new MockMarketDataProvider({ failWith: new Error('down') }),
    });
    try {
      const res = await request(server()).get(`/api/v1/option-chain/${NIFTY}/snapshot`).expect(503);
      expect(res.body.error).toEqual({
        code: 'PROVIDER_UNAVAILABLE',
        message: 'Market data provider unavailable (mock)',
        details: { provider: 'mock' },
      });
    } finally {
      await app.close();
    }
  });
});
