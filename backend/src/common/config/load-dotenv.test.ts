import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadDotenv } from './load-dotenv';

describe('loadDotenv', () => {
  const key = 'TRADEOS_DOTENV_PROBE';
  afterEach(() => {
    delete process.env[key];
  });

  it('applies files in priority order without overriding the real environment', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tradeos-env-'));
    writeFileSync(join(dir, '.env'), `${key}=base\n`);
    writeFileSync(join(dir, '.env.development'), `${key}=dev\n`);
    expect(loadDotenv(dir, 'development')).toEqual(['.env.development', '.env']);
    expect(process.env[key]).toBe('dev');
    delete process.env[key];
    process.env[key] = 'real';
    loadDotenv(dir, 'development');
    expect(process.env[key]).toBe('real');
  });
});
