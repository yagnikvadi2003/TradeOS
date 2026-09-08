import { describe, expect, it, vi } from 'vitest';
import { ApiError, HttpClient } from './http-client';
import { indexQuotesResponseSchema } from './schemas';

function fetchWith(status: number, body: unknown): typeof fetch {
  const impl: typeof fetch = () =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  return vi.fn(impl);
}

describe('HttpClient', () => {
  it('validates the response against the schema', async () => {
    const client = new HttpClient({
      baseUrl: '/api/v1',
      fetchImpl: fetchWith(200, { data: 'nope' }),
    });
    await expect(client.get('/market/quotes', indexQuotesResponseSchema)).rejects.toBeInstanceOf(
      ApiError,
    );
  });

  it('surfaces HTTP errors with status', async () => {
    const client = new HttpClient({ baseUrl: '/api/v1', fetchImpl: fetchWith(503, {}) });
    await expect(client.get('/market/quotes', indexQuotesResponseSchema)).rejects.toMatchObject({
      status: 503,
    });
  });

  it('returns parsed data on success', async () => {
    const payload = {
      data: [
        {
          instrumentKey: 'NSE:INDEX:NIFTY50',
          ltp: 1,
          previousClose: 1,
          open: 1,
          high: 1,
          low: 1,
          change: 0,
          changePercent: 0,
          updatedAt: 0,
          source: 'snapshot',
        },
      ],
    };
    const client = new HttpClient({ baseUrl: '/api/v1/', fetchImpl: fetchWith(200, payload) });
    const result = await client.get('market/quotes', indexQuotesResponseSchema);
    expect(result.data[0]?.instrumentKey).toBe('NSE:INDEX:NIFTY50');
  });
});
