import { z } from 'zod';

/**
 * Typed, validated backend environment. Secrets never leave this process;
 * nothing here is ever serialized into a response.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  /** Reported by /health and Sentry releases; set from package.json at boot. */
  APP_VERSION: z.string().default(process.env.npm_package_version ?? '0.0.0'),
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
  /** OpenAPI UI at /api/docs. Defaults: on outside production, off in production. */
  SWAGGER_ENABLED: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  /** Per-request access logs. Off by default in production to save CPU on small hosts. */
  HTTP_REQUEST_LOGGING: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  /** Honour X-Forwarded-For (only behind a trusted reverse proxy). */
  TRUST_PROXY: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  /** PostgreSQL pool size. Small by default: free tiers cap connections. */
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(4),
  /** Sentry DSN; error tracking is disabled when absent. */
  SENTRY_DSN: z.url().optional(),
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0),
  /** Redis connection URL. Optional: single-instance mode runs fully in-process without it. */
  REDIS_URL: z.string().min(1).optional(),
  /**
   * HS256 secret for application WebSocket session tokens. Required in
   * production; generated per process in development when absent.
   */
  REALTIME_JWT_SECRET: z.string().min(32).optional(),
  /** Lifetime of a realtime session token. */
  REALTIME_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(86_400).default(900),
  /** Application WebSocket limits. */
  WS_MAX_CONNECTIONS: z.coerce.number().int().min(1).default(500),
  WS_MAX_CONNECTIONS_PER_IP: z.coerce.number().int().min(1).default(10),
  WS_MAX_SUBSCRIPTIONS_PER_CLIENT: z.coerce.number().int().min(1).default(600),
  WS_MAX_MESSAGE_BYTES: z.coerce.number().int().min(256).default(16_384),
  WS_MESSAGES_PER_SECOND: z.coerce.number().int().min(1).default(20),
  /** Delta flush cadence per client (ms). Latest state wins inside a window. */
  WS_FLUSH_INTERVAL_MS: z.coerce.number().int().min(20).max(2_000).default(100),
  /** Feed: no message or ping for this long → DEGRADED; twice → reconnect. */
  FEED_STALE_AFTER_MS: z.coerce.number().int().min(1_000).default(15_000),
  FEED_CONNECT_TIMEOUT_MS: z.coerce.number().int().min(1_000).default(10_000),
  /** Operator key protecting provider credential endpoints. Required in production. */
  OPERATOR_API_KEY: z.string().min(24).optional(),
  /** AES-256-GCM key (base64, 32 bytes) for provider credentials at rest. Required in production. */
  CREDENTIAL_ENCRYPTION_KEY: z.string().min(40).optional(),
});

export type AppEnv = Omit<z.infer<typeof envSchema>, 'SWAGGER_ENABLED'> & {
  SWAGGER_ENABLED: boolean;
};

export function loadEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid backend environment: ${issues}`);
  }
  const env = {
    ...parsed.data,
    SWAGGER_ENABLED: parsed.data.SWAGGER_ENABLED ?? parsed.data.NODE_ENV !== 'production',
  };
  if (env.NODE_ENV === 'production' && env.MARKET_DATA_PROVIDER === 'mock') {
    throw new Error('MARKET_DATA_PROVIDER=mock is not permitted in production');
  }
  if (env.NODE_ENV === 'production' && !env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required in production');
  }
  if (env.NODE_ENV === 'production') {
    for (const key of [
      'REALTIME_JWT_SECRET',
      'OPERATOR_API_KEY',
      'CREDENTIAL_ENCRYPTION_KEY',
    ] as const) {
      if (!env[key]) throw new Error(`${key} is required in production`);
    }
  }
  return env;
}

export const APP_ENV = Symbol('APP_ENV');
