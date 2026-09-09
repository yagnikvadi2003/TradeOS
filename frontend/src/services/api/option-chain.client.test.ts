import { describe, expect, it, vi } from 'vitest';
import { HttpClient } from './http-client';
import { HttpMarketDataClient } from './http-market-data.client';
import { MockMarketDataClient } from './mock-market-data.client';
import { simulateExpiries, simulateSnapshot } from './option-chain.simulator';
import { optionChainSnapshotDtoSchema, snapshotResponseSchema } from './option-chain.schemas';

const NOW = Date.UTC(2026, 8, 8, 5, 30);

function mock(now = NOW) {
  return new MockMarketDataClient({ latencyMs: 0, now: () => now });
}

describe('MockMarketDataClient option chain', () => {
  it('returns metadata with expiries, lot size and strike step', async () => {
    const meta = await mock().getOptionChainMetadata('NSE:INDEX:BANKNIFTY');
    expect(meta.strikeStep).toBe(100);
    expect(meta.lotSize).toBe(35);
    expect(meta.expiries.length).toBeGreaterThan(0);
    expect(meta.nearestExpiry).toBe(meta.expiries[0]?.expiryDate);
  });

  it('refuses INDIA VIX', async () => {
    await expect(mock().getOptionChainMetadata('NSE:INDEX:INDIAVIX')).rejects.toThrow(
      /option chain/i,
    );
    await expect(mock().getOptionChainSnapshot('NSE:INDEX:INDIAVIX', null)).rejects.toThrow();
  });

  it('is deterministic within a quote bucket and tagged simulated', async () => {
    const a = await mock().getOptionChainSnapshot('NSE:INDEX:NIFTY50', null);
    const b = await mock().getOptionChainSnapshot('NSE:INDEX:NIFTY50', null);
    expect(a).toEqual(b);
    expect(a.source).toBe('simulated');
    expect(a.underlying.source).toBe('simulated');
    expect(a.strikes.filter((s) => s.isAtm)).toHaveLength(1);
    expect(a.strikes.length).toBe(81);
  });

  it('rejects an unlisted expiry', async () => {
    await expect(mock().getOptionChainSnapshot('NSE:INDEX:NIFTY50', '2020-01-01')).rejects.toThrow(
      /No listed expiry/,
    );
  });

  it('produces a snapshot that satisfies the v1 DTO schema', () => {
    const expiry = simulateExpiries('BSE:INDEX:SENSEX', NOW)[0]!;
    const snapshot = simulateSnapshot('BSE:INDEX:SENSEX', expiry, NOW, 3);
    expect(optionChainSnapshotDtoSchema.safeParse(snapshot).success).toBe(true);
  });
});

describe('HttpMarketDataClient option chain', () => {
  it('calls the versioned snapshot endpoint and maps the DTO', async () => {
    const expiry = simulateExpiries('NSE:INDEX:NIFTY50', NOW)[0]!;
    const snapshot = simulateSnapshot('NSE:INDEX:NIFTY50', expiry, NOW, 2);
    const body = snapshotResponseSchema.parse({
      data: snapshot,
      meta: { version: 'v1', generatedAt: NOW },
    });
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const client = new HttpMarketDataClient(new HttpClient({ baseUrl: '/api/v1', fetchImpl }));
    const result = await client.getOptionChainSnapshot('NSE:INDEX:NIFTY50', expiry.expiryDate);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      `/api/v1/option-chain/NSE%3AINDEX%3ANIFTY50/snapshot?expiry=${expiry.expiryDate}`,
    );
    expect(result.atmStrike).toBe(snapshot.atmStrike);
    expect(result.strikes).toHaveLength(5);
  });

  it('rejects a response that fails schema validation', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ data: { nope: true } }), { status: 200 }));
    const client = new HttpMarketDataClient(new HttpClient({ baseUrl: '/api/v1', fetchImpl }));
    await expect(client.getOptionChainExpiries('NSE:INDEX:NIFTY50')).rejects.toThrow(
      /schema validation/,
    );
  });

  it('surfaces the backend error status', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ error: { code: 'OPTION_CHAIN_NOT_SUPPORTED', message: 'x' } }),
        {
          status: 404,
        },
      ),
    );
    const client = new HttpMarketDataClient(new HttpClient({ baseUrl: '/api/v1', fetchImpl }));
    await expect(client.getOptionChainMetadata('NSE:INDEX:INDIAVIX')).rejects.toMatchObject({
      status: 404,
    });
  });
});
