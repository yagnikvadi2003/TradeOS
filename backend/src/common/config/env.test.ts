import { describe, expect, it } from 'vitest';
import { loadEnv } from './env';

describe('loadEnv', () => {
  it('applies development defaults', () => {
    const env = loadEnv({});
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.MARKET_DATA_PROVIDER).toBe('mock');
    expect(env.SWAGGER_ENABLED).toBe(true);
  });

  it('refuses the mock provider in production', () => {
    expect(() =>
      loadEnv({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://u:p@h:5432/db',
        MARKET_DATA_PROVIDER: 'mock',
      }),
    ).toThrow(/mock is not permitted/);
  });

  it('requires a database in production', () => {
    expect(() => loadEnv({ NODE_ENV: 'production', MARKET_DATA_PROVIDER: 'upstox' })).toThrow(
      /DATABASE_URL is required/,
    );
  });

  it('rejects malformed numbers', () => {
    expect(() => loadEnv({ PORT: 'abc' })).toThrow(/PORT/);
  });
});
