import { type FeedLease } from '@/infrastructure/realtime/feed-lease';
import { type RedisHandle } from './redis-client';

const KEY = 'tradeos:feed:lease';

/**
 * `SET NX PX` lease. The holder renews every `ttl / 3`; if renewal fails
 * (Redis gone, or another instance took over after a pause) the instance
 * demotes itself so at most one upstream provider connection exists.
 */
function ignore(): void {
  /* errors are optional to observe */
}

export class RedisFeedLease implements FeedLease {
  readonly kind = 'redis' as const;
  private leader = false;
  private timer: NodeJS.Timeout | null = null;
  private readonly listeners = new Set<(isLeader: boolean) => void>();

  constructor(
    private readonly redis: RedisHandle,
    readonly instanceId: string,
    private readonly ttlMs = 15_000,
    private readonly onError: (error: unknown) => void = ignore,
  ) {}

  async acquire(): Promise<boolean> {
    await this.tryAcquire();
    this.timer ??= setInterval(
      () => void this.tryAcquire(),
      Math.max(1_000, Math.floor(this.ttlMs / 3)),
    );
    return this.leader;
  }

  private async tryAcquire(): Promise<void> {
    let next: boolean;
    try {
      if (this.leader) {
        // Renew only if we still own it (compare-and-expire).
        const owner = await this.redis.client.get(KEY);
        next =
          owner === this.instanceId && (await this.redis.client.pexpire(KEY, this.ttlMs)) === 1;
      } else {
        next = (await this.redis.client.set(KEY, this.instanceId, 'PX', this.ttlMs, 'NX')) === 'OK';
      }
    } catch (error) {
      this.onError(error);
      next = false;
    }
    if (next !== this.leader) {
      this.leader = next;
      for (const l of this.listeners) l(next);
    }
  }

  async release(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (!this.leader) return;
    this.leader = false;
    try {
      const owner = await this.redis.client.get(KEY);
      if (owner === this.instanceId) await this.redis.client.del(KEY);
    } catch (error) {
      this.onError(error);
    }
  }

  onChange(listener: (isLeader: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
