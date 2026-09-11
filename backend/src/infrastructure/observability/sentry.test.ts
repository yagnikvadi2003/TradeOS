import { describe, expect, it } from 'vitest';
import { scrubEvent, scrubString } from './sentry';

describe('sentry scrubbing', () => {
  it('removes credentials from headers, query, url, user and messages', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.abcdefghijklmnopqrstuvwxyz0123';
    const event = scrubEvent({
      request: {
        headers: {
          Authorization: 'Bearer abc',
          Cookie: 'a=b',
          'X-Operator-Key': 'k',
          Accept: 'json',
        },
        query_string: 'code=SECRET&expiry=2026-09-15',
        url: 'https://x/api/v1/providers/upstox/auth/callback?code=SECRET&state=S',
        cookies: { a: 'b' },
        data: { password: 'x' },
      },
      user: { id: 'u1', email: 'a@b.c' },
      message: `token ${jwt} leaked`,
      exception: { values: [{ value: `Bearer ${'t'.repeat(30)} rejected` }] },
    });
    expect(event.request?.headers).toEqual({
      Authorization: '[redacted]',
      Cookie: '[redacted]',
      'X-Operator-Key': '[redacted]',
      Accept: 'json',
    });
    expect(event.request?.query_string).toBe('code=%5Bredacted%5D&expiry=2026-09-15');
    expect(event.request?.url).not.toContain('SECRET');
    expect(event.request?.url).not.toContain('state=S');
    expect(event.request && 'cookies' in event.request).toBe(false);
    expect(event.request && 'data' in event.request).toBe(false);
    expect('user' in event).toBe(false);
    expect(event.message).toBe('token [redacted] leaked');
    expect(event.exception?.values?.[0]?.value).toBe('[redacted] rejected');
    expect(scrubString('plain text')).toBe('plain text');
  });
});
