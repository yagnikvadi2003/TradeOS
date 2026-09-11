import { Redis } from 'ioredis';

export interface RedisHandle {
  readonly client: Redis;
  /** Dedicated connection: a subscribing ioredis client cannot issue commands. */
  readonly subscriber: Redis;
  close(): Promise<void>;
}

export const REDIS = Symbol('REDIS');

/**
 * Connects to Redis with a short, bounded readiness wait. Any failure
 * resolves to `null` so the caller can fall back to in-process mode; Redis
 * is an optional layer and must never block boot.
 */
export async function connectRedis(url: string, timeoutMs = 3_000): Promise<RedisHandle | null> {
  const options = {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: timeoutMs,
    retryStrategy: (times: number) => Math.min(30_000, 500 * 2 ** times),
  };
  const client = new Redis(url, options);
  const subscriber = new Redis(url, options);
  const swallow = (): void => undefined; // ioredis emits 'error' on every reconnect attempt
  client.on('error', swallow);
  subscriber.on('error', swallow);
  try {
    await Promise.all([client.connect(), subscriber.connect()]);
    await client.ping();
  } catch {
    client.disconnect();
    subscriber.disconnect();
    return null;
  }
  return {
    client,
    subscriber,
    close: async () => {
      await Promise.allSettled([client.quit(), subscriber.quit()]);
    },
  };
}
