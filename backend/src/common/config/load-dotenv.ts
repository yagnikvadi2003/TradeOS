import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from 'dotenv';

/**
 * Environment separation. Files are applied in priority order and never
 * override variables that are already set (real environment > files):
 *
 *   .env.<NODE_ENV>.local  → .env.local  → .env.<NODE_ENV>  → .env
 *
 * `.env.test` is intentionally NOT loaded for local secrets: tests run on
 * the in-memory repository and the mock provider. Nothing here logs values.
 */
export function loadDotenv(
  cwd = process.cwd(),
  nodeEnv = process.env.NODE_ENV ?? 'development',
): string[] {
  const candidates = [`.env.${nodeEnv}.local`, '.env.local', `.env.${nodeEnv}`, '.env'];
  const loaded: string[] = [];
  for (const name of candidates) {
    const path = resolve(cwd, name);
    if (!existsSync(path)) continue;
    config({ path, override: false, quiet: true });
    loaded.push(name);
  }
  return loaded;
}
