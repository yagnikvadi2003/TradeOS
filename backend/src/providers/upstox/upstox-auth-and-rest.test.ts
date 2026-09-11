import { describe, expect, it, vi } from 'vitest';
import { RealtimeTokenService } from '@/common/realtime/realtime-auth';
import { InMemoryMarketStateStore } from '@/infrastructure/realtime/market-state.store';
import { CredentialCipher } from './auth/credential-cipher';
import { InMemoryCredentialStore } from './auth/credential.store';
import { nextIstExpiry, UpstoxAuthService } from './auth/upstox-auth.service';
import { UpstoxRestClient } from './rest/upstox-rest.client';
import { UpstoxAuthError } from './websocket/upstox-feed.transport';
import { UpstoxMarketDataProvider } from './upstox-market-data.provider';
import { UpstoxSymbolMap } from './mappers/upstox-symbol-map';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('RealtimeTokenService', () => {
  it('issues and verifies HS256 tokens, rejecting tampering and expiry', () => {
    let now = 1_000_000_000;
    const svc = new RealtimeTokenService('s'.repeat(40), () => now);
    const { token, claims } = svc.issue('u1', 60, ['*']);
    expect(svc.verify(token)).toEqual(claims);
    expect(svc.verify(token.slice(0, -2) + 'zz')).toBeNull();
    expect(new RealtimeTokenService('t'.repeat(40), () => now).verify(token)).toBeNull();
    expect(svc.verify('garbage')).toBeNull();
    now += 61_000;
    expect(svc.verify(token)).toBeNull();
  });
});

describe('CredentialCipher', () => {
  it('round-trips and detects tampering', () => {
    const cipher = new CredentialCipher(CredentialCipher.generateKey());
    const secret = cipher.encrypt('access-token-value');
    expect(secret.ciphertext).not.toContain('access');
    expect(cipher.decrypt(secret)).toBe('access-token-value');
    expect(() => cipher.decrypt({ ...secret, tag: secret.iv })).toThrow();
    expect(() => new CredentialCipher('short')).toThrow(/32 bytes/);
  });
});

describe('UpstoxAuthService', () => {
  it('exchanges an authorization code with the client secret and stores the token encrypted-at-rest semantics', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = (init?.body as URLSearchParams).toString();
      expect(body).toContain('grant_type=authorization_code');
      expect(body).toContain('client_secret=sec');
      return json({ access_token: 'tok'.repeat(10) });
    });
    const store = new InMemoryCredentialStore();
    const now = Date.UTC(2026, 8, 8, 5, 30);
    const svc = new UpstoxAuthService(
      {
        apiBaseUrl: 'https://api.example',
        clientId: 'client-1',
        clientSecret: 'sec',
        redirectUri: 'https://app/cb',
      },
      store,
      fetchImpl,
      () => now,
    );
    expect(svc.buildAuthorizationUrl('st')).toContain(
      '/v2/login/authorization/dialog?response_type=code&client_id=client-1',
    );
    const { expiresAt } = await svc.exchangeAuthorizationCode('abc');
    expect(expiresAt).toBe(nextIstExpiry(now));
    expect(await svc.getAccessToken()).toBe('tok'.repeat(10));
    expect((await svc.status()).hasToken).toBe(true);
  });

  it('prefers a static token and treats expired stored tokens as absent', async () => {
    const store = new InMemoryCredentialStore();
    await store.set('upstox', 'old-token-value', 10);
    const svc = new UpstoxAuthService(
      { apiBaseUrl: 'https://api.example' },
      store,
      fetch,
      () => 20,
    );
    expect(await svc.getAccessToken()).toBeUndefined();
    const withStatic = new UpstoxAuthService(
      { apiBaseUrl: 'https://api.example', staticAccessToken: 'static-token-value' },
      store,
    );
    expect(await withStatic.getAccessToken()).toBe('static-token-value');
  });

  it('computes the 03:30 IST expiry', () => {
    const at = Date.UTC(2026, 8, 8, 5, 30); // 11:00 IST 8 Sep
    expect(new Date(nextIstExpiry(at)).toISOString()).toBe('2026-09-08T22:00:00.000Z'); // 03:30 IST 9 Sep
    const early = Date.UTC(2026, 8, 8, 20, 0); // 01:30 IST 9 Sep
    expect(new Date(nextIstExpiry(early)).toISOString()).toBe('2026-09-08T22:00:00.000Z');
  });
});

describe('UpstoxRestClient + UpstoxMarketDataProvider', () => {
  const contract = (
    strike: number,
    type: 'CE' | 'PE',
    token: string,
    expiry = '2026-09-15',
    weekly = true,
  ) => ({
    name: 'NIFTY',
    segment: 'NSE_FO',
    exchange: 'NSE',
    expiry,
    instrument_key: `NSE_FO|${token}`,
    exchange_token: token,
    trading_symbol: `NIFTY ${strike} ${type} 15 SEP 26`,
    tick_size: 5,
    lot_size: 75,
    instrument_type: type,
    freeze_quantity: 1800,
    underlying_key: 'NSE_INDEX|Nifty 50',
    underlying_type: 'INDEX',
    underlying_symbol: 'NIFTY',
    strike_price: strike,
    minimum_lot: 75,
    weekly,
  });

  function build(
    routes: Record<string, () => Response>,
    liveState = new InMemoryMarketStateStore(),
  ) {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const path = new URL(url).pathname;
      const handler = routes[path];
      return handler ? handler() : json({ status: 'error' }, 500);
    });
    const symbols = new UpstoxSymbolMap();
    const rest = new UpstoxRestClient(
      'https://api.example',
      async () => 'token-value-123456',
      fetchImpl,
    );
    const provider = new UpstoxMarketDataProvider(rest, symbols, liveState, () => 5_000);
    return { provider, fetchImpl, symbols, rest };
  }

  it('maps contracts and expiries from the option-contract API and caches them', async () => {
    const { provider, fetchImpl } = build({
      '/v2/option/contract': () =>
        json({
          status: 'success',
          data: [
            contract(24_000, 'CE', '1'),
            contract(24_000, 'PE', '2'),
            contract(24_050, 'CE', '3', '2026-09-29', false),
            { bogus: true },
          ],
        }),
    });
    await expect(provider.listExpiries('NSE:INDEX:NIFTY50')).rejects.toThrow(
      /PROVIDER_PAYLOAD_INVALID|option\/contract/,
    );
    const {
      provider: ok,
      fetchImpl: f2,
      symbols,
    } = build({
      '/v2/option/contract': () =>
        json({
          status: 'success',
          data: [
            contract(24_000, 'CE', '1'),
            contract(24_000, 'PE', '2'),
            contract(24_050, 'CE', '3', '2026-09-29', false),
          ],
        }),
    });
    const expiries = await ok.listExpiries('NSE:INDEX:NIFTY50');
    expect(expiries).toEqual([
      { expiryDate: '2026-09-15', cycle: 'WEEKLY' },
      { expiryDate: '2026-09-29', cycle: 'MONTHLY' },
    ]);
    const contracts = await ok.listOptionContracts('NSE:INDEX:NIFTY50', '2026-09-15');
    expect(contracts.map((c) => c.contractKey)).toEqual([
      'NSE:OPT:NIFTY50:2026-09-15:24000:CE',
      'NSE:OPT:NIFTY50:2026-09-15:24000:PE',
    ]);
    expect(contracts[0]?.tickSize).toBe(0.05);
    expect(symbols.upstoxKeyFor('NSE:OPT:NIFTY50:2026-09-15:24000:CE')).toBe('NSE_FO|1');
    expect(f2).toHaveBeenCalledTimes(1); // cached
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await expect(ok.listExpiries('NSE:INDEX:INDIAVIX')).rejects.toThrow(/no option chain/);
  });

  it('serves option quotes from live state and falls back to the chain API for cold keys', async () => {
    const live = new InMemoryMarketStateStore();
    const { provider, fetchImpl } = build(
      {
        '/v2/option/contract': () =>
          json({
            status: 'success',
            data: [contract(24_000, 'CE', '1'), contract(24_000, 'PE', '2')],
          }),
        '/v2/option/chain': () =>
          json({
            status: 'success',
            data: [
              {
                expiry: '2026-09-15',
                strike_price: 24_000,
                underlying_spot_price: 24_010,
                call_options: {
                  instrument_key: 'NSE_FO|1',
                  market_data: {
                    ltp: 100,
                    close_price: 90,
                    oi: 1000,
                    prev_oi: 900,
                    bid_price: 99,
                    ask_price: 101,
                    bid_qty: 75,
                    ask_qty: 150,
                    volume: 5,
                  },
                  option_greeks: { delta: 0.5, theta: -1, gamma: 0.001, vega: 2, iv: 14.2 },
                },
                put_options: { instrument_key: 'NSE_FO|2', market_data: { ltp: 80 } },
              },
            ],
          }),
        '/v3/market-quote/ohlc': () =>
          json({
            status: 'success',
            data: {
              'NSE_INDEX:Nifty 50': {
                last_price: 24_010,
                live_ohlc: { open: 23_990, high: 24_050, low: 23_950, close: 24_010 },
                prev_ohlc: { close: 24_000 },
              },
            },
          }),
      },
      live,
    );
    await provider.listOptionContracts('NSE:INDEX:NIFTY50', '2026-09-15');
    live.apply([
      {
        kind: 'option',
        contractKey: 'NSE:OPT:NIFTY50:2026-09-15:24000:PE',
        underlyingKey: 'NSE:INDEX:NIFTY50',
        exchangeCode: 'NSE',
        expiryDate: '2026-09-15',
        strike: 24_000,
        optionType: 'PE',
        timestamp: 4_000,
        receivedAt: 4_000,
        ltp: 81,
        previousClose: 70,
        change: 11,
        changePercent: 15.71,
        volume: 1,
        openInterest: 2,
        openInterestChange: null,
        impliedVolatility: 13,
        bid: 80,
        ask: 82,
        bidQuantity: 75,
        askQuantity: 75,
        greeks: null,
        source: 'live',
      },
    ]);
    const quotes = await provider.getOptionMarketData([
      'NSE:OPT:NIFTY50:2026-09-15:24000:CE',
      'NSE:OPT:NIFTY50:2026-09-15:24000:PE',
    ]);
    const ce = quotes.find((q) => q.contractKey.endsWith(':CE'))!;
    const pe = quotes.find((q) => q.contractKey.endsWith(':PE'))!;
    expect(ce).toMatchObject({
      ltp: 100,
      change: 10,
      openInterestChange: 100,
      impliedVolatility: 14.2,
      source: 'snapshot',
      greeks: { delta: 0.5 },
    });
    expect(pe).toMatchObject({ ltp: 81, source: 'live' });
    expect(
      fetchImpl.mock.calls.filter((c) => (c[0] as string).includes('/v2/option/chain')),
    ).toHaveLength(1);
    const underlying = await provider.getUnderlyingQuote('NSE:INDEX:NIFTY50');
    expect(underlying).toMatchObject({
      ltp: 24_010,
      previousClose: 24_000,
      change: 10,
      open: 23_990,
      source: 'snapshot',
    });
  });

  it('turns 401 into an auth error and non-success bodies into payload errors', async () => {
    const { rest } = build({ '/v2/option/contract': () => json({}, 401) });
    await expect(rest.getOptionContracts('NSE_INDEX|Nifty 50')).rejects.toBeInstanceOf(
      UpstoxAuthError,
    );
    const { rest: r2 } = build({
      '/v2/option/contract': () => json({ status: 'error', errors: [] }),
    });
    await expect(r2.getOptionContracts('NSE_INDEX|Nifty 50')).rejects.toThrow(/status=error/);
  });
});
