import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { type App } from 'supertest/types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '@/tests/create-test-app';

describe('foundation endpoints', () => {
  let app: INestApplication;
  const server = (): App => app.getHttpServer() as App;
  beforeAll(async () => {
    app = await createTestApp({ env: { SWAGGER_ENABLED: true } });
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });

  it('reports coarse dependency states without operational internals', async () => {
    const res = await request(server()).get('/health').expect(200);
    expect(res.body).toMatchObject({
      status: 'ok',
      checks: { database: 'disabled', redis: 'disabled', provider: 'ok', websocket: 'ok' },
    });
    expect(typeof res.body.version).toBe('string');
    expect(res.body.realtime).toBeUndefined();
    expect(res.headers['cache-control']).toBe('no-store');
    await request(server()).get('/health/live').expect(200, { status: 'ok' });
    await request(server()).get('/health/ready').expect(200);
  });

  it('echoes a well-formed request id and generates one otherwise', async () => {
    const echoed = await request(server())
      .get('/health/live')
      .set('X-Request-Id', 'req-abcdef123456');
    expect(echoed.headers['x-request-id']).toBe('req-abcdef123456');
    const generated = await request(server()).get('/health/live').set('X-Request-Id', 'bad id!');
    expect(generated.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('serves the OpenAPI document with every REST endpoint documented', async () => {
    const res = await request(server()).get('/api/docs.json').expect(200);
    const paths = Object.keys(res.body.paths as Record<string, unknown>);
    expect(paths).toEqual(
      expect.arrayContaining([
        '/health',
        '/health/live',
        '/health/ready',
        '/metrics',
        '/api/v1/market/quotes',
        '/api/v1/option-chain/{instrument}',
        '/api/v1/option-chain/{instrument}/expiries',
        '/api/v1/option-chain/{instrument}/snapshot',
        '/api/v1/realtime/token',
        '/api/v1/providers/upstox/auth/status',
        '/api/v1/providers/upstox/auth/url',
        '/api/v1/providers/upstox/auth/callback',
      ]),
    );
    for (const path of paths) {
      for (const op of Object.values(
        res.body.paths[path] as Record<string, { responses: Record<string, unknown> }>,
      )) {
        expect(Object.keys(op.responses).length).toBeGreaterThan(0);
      }
    }
    const snapshot = res.body.paths['/api/v1/option-chain/{instrument}/snapshot'].get;
    expect(
      snapshot.responses['200'].content['application/json'].schema.properties.data,
    ).toBeDefined();
    expect(JSON.stringify(res.body)).not.toMatch(/client_secret|UPSTOX_ACCESS_TOKEN/);
  });

  it('exposes the required Prometheus families', async () => {
    const res = await request(server()).get('/metrics').expect(200);
    for (const name of [
      'market_provider_connection',
      'market_ws_clients',
      'http_request_duration_seconds',
      'http_errors_total',
      'db_query_duration_seconds',
      'nodejs_eventloop_lag_ms',
      'redis_available',
      'process_memory_rss_bytes',
    ]) {
      expect(res.text).toContain(name);
    }
    expect(res.headers['content-type']).toContain('text/plain');
  });
});
