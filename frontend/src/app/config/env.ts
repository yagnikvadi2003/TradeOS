import { z } from 'zod';

/**
 * Typed, validated environment. Only `VITE_`-prefixed variables reach the
 * browser bundle; no secrets ever belong here.
 */
const envSchema = z.object({
  VITE_APP_NAME: z.string().min(1).default('TradeOS'),
  VITE_PUBLIC_ORIGIN: z.url().default('http://localhost:5173'),
  VITE_API_BASE_URL: z.string().min(1).default('/api/v1'),
  VITE_MARKET_DATA_SOURCE: z.enum(['http', 'mock']).default('http'),
  MODE: z.string().default('development'),
  DEV: z.boolean().default(false),
  PROD: z.boolean().default(false),
});

export type AppEnv = z.infer<typeof envSchema>;

function loadEnv(): AppEnv {
  const raw = import.meta.env as Record<string, unknown>;
  const parsed = envSchema.safeParse({
    VITE_APP_NAME: raw.VITE_APP_NAME,
    VITE_PUBLIC_ORIGIN: raw.VITE_PUBLIC_ORIGIN,
    VITE_API_BASE_URL: raw.VITE_API_BASE_URL,
    VITE_MARKET_DATA_SOURCE: raw.VITE_MARKET_DATA_SOURCE,
    MODE: raw.MODE,
    DEV: raw.DEV,
    PROD: raw.PROD,
  });
  if (!parsed.success) {
    throw new Error(`Invalid frontend environment: ${parsed.error.message}`);
  }
  return parsed.data;
}

export const env: AppEnv = loadEnv();
