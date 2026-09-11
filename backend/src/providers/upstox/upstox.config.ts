import { z } from 'zod';

/**
 * Upstox-specific configuration, read from the environment by the adapter
 * only. The access token is the analytics/long-lived token or a daily
 * access token generated out of band; it never leaves this process.
 */
export const upstoxEnvSchema = z.object({
  UPSTOX_ACCESS_TOKEN: z.string().min(16).optional(),
  UPSTOX_API_BASE_URL: z
    .url()
    .default('https://api.upstox.com')
    .refine((u) => {
      const { protocol, hostname } = new URL(u);
      return (
        protocol === 'https:' && (hostname === 'upstox.com' || hostname.endsWith('.upstox.com'))
      );
    }, 'UPSTOX_API_BASE_URL must be an https upstox.com host'),
  UPSTOX_CLIENT_ID: z.string().min(8).optional(),
  UPSTOX_CLIENT_SECRET: z.string().min(8).optional(),
  UPSTOX_REDIRECT_URI: z.url().optional(),
  /** Feed mode requested upstream. `full` carries LTPC, depth-5, OI, IV and Greeks. */
  UPSTOX_FEED_MODE: z.enum(['ltpc', 'option_greeks', 'full', 'full_d30']).default('full'),
  /** Upstream cap for the chosen mode (2000 keys for `full`, per the V3 limits table). */
  UPSTOX_MAX_SUBSCRIPTIONS: z.coerce.number().int().min(1).max(5000).default(1500),
});

export type UpstoxEnv = z.infer<typeof upstoxEnvSchema>;

export const UPSTOX_ENV = Symbol('UPSTOX_ENV');

export function loadUpstoxEnv(source: NodeJS.ProcessEnv = process.env): UpstoxEnv {
  const parsed = upstoxEnvSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(
      `Invalid Upstox environment: ${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}`,
    );
  }
  return parsed.data;
}
