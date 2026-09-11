import { describe, expect, it } from 'vitest';
import { scrubEvent } from './sentry';

describe('browser sentry scrubbing', () => {
  it('drops headers, cookies, user and token-shaped strings', () => {
    const event = scrubEvent({
      request: {
        url: 'https://x/cb?code=SECRET',
        headers: { Authorization: 'Bearer x' },
        cookies: 'a=b',
      },
      user: { id: 1 },
      message: 'Bearer ' + 'a'.repeat(30),
      breadcrumbs: [
        { data: { url: 'https://x/api/v1/realtime/token?x=1', headers: {}, body: 'b' } },
      ],
    });
    expect(event.request?.headers).toBeUndefined();
    expect(event.request?.cookies).toBeUndefined();
    expect(event.request?.url).toBe('https://x/cb?code=[redacted]');
    expect(event.user).toBeUndefined();
    expect(event.message).toBe('[redacted]');
    expect(event.breadcrumbs?.[0]?.data).toEqual({ url: 'https://x/api/v1/realtime/token' });
  });
});
