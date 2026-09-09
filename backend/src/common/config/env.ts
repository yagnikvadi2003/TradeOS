import { z } from 'zod';

/**
 * Typed, validated backend environment. Secrets never leave this process;
 * nothing here is ever serialized into a response.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().min(1).default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** Comma-separated list of allowed browser origins. */
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  /** PostgreSQL connection string. Absent in development → in-memory repository. */
  DATABASE_URL: z.url().optional(),
  /** Market-data provider. `mock` is deterministic test data and refused in production. */
  MARKET_DATA_PROVIDER: z.enum(['mock', 'upstox']).default('mock'),
  /** Seconds an assembled option-chain snapshot stays in the realtime state layer. */
  OPTION_CHAIN_SNAPSHOT_TTL_SECONDS: z.coerce.number().int().min(1).max(60).default(2),
  /** Seconds before option metadata (expiries/contracts) is re-validated with the provider. */
  OPTION_METADATA_TTL_SECONDS: z.coerce.number().int().min(60).max(86_400).default(900),
  /** Global REST rate limit: requests per window per client. */
  RATE_LIMIT_TTL_SECONDS: z.coerce.number().int().min(1).default(60),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(120),
  SWAGGER_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
});

export type AppEnv = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid backend environment: ${issues}`);
  }
  const env = parsed.data;
  if (env.NODE_ENV === 'production' && env.MARKET_DATA_PROVIDER === 'mock') {
    throw new Error('MARKET_DATA_PROVIDER=mock is not permitted in production');
  }
  if (env.NODE_ENV === 'production' && !env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required in production');
  }
  return env;
}

export const APP_ENV = Symbol('APP_ENV');
