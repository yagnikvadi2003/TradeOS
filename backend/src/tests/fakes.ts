import { type Logger } from 'nestjs-pino';
import { vi } from 'vitest';
import { type AppEnv, loadEnv } from '@/common/config/env';

/** Tue 08 Sep 2026 11:00 IST — regular session. */
export const FIXED_NOW = Date.UTC(2026, 8, 8, 5, 30);

export function testEnv(overrides: Partial<AppEnv> = {}): AppEnv {
  return { ...loadEnv({ NODE_ENV: 'test' }), ...overrides };
}

export function fakeLogger(): Logger {
  return {
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    verbose: vi.fn(),
    fatal: vi.fn(),
  } as unknown as Logger;
}
