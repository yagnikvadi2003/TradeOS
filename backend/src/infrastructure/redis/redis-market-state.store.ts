import { InMemoryMarketStateStore } from '@/infrastructure/realtime/market-state.store';
import { marketUpdateSchema } from '@/modules/market-stream/domain/market-update.schemas';
import { type MarketUpdate, streamKeyOf } from '@/modules/market-stream/domain/market-update';
import { type RedisHandle } from './redis-client';

const HASH = 'tradeos:market:state';

/**
 * In-memory state (hot reads) mirrored into a Redis hash in coalesced
 * batches: one HSET pipeline per flush window carrying only the latest
 * value per key, so a 500-tick burst for one contract costs one field
 * write. The TTL is refreshed on every flush; stale state expires with the
 * session. On boot, existing state is hydrated so a restarted instance can
 * answer snapshots before the feed warms.
 */
function ignore(): void {
  /* errors are optional to observe */
}

export class RedisMarketStateStore extends InMemoryMarketStateStore {
  override readonly kind = 'redis' as const;
  private readonly dirty = new Map<string, MarketUpdate>();
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly redis: RedisHandle,
    private readonly flushIntervalMs = 250,
    private readonly ttlSeconds = 6 * 60 * 60,
    private readonly onError: (error: unknown) => void = ignore,
  ) {
    super();
  }

  async hydrate(): Promise<number> {
    try {
      const all = await this.redis.client.hgetall(HASH);
      let n = 0;
      for (const raw of Object.values(all)) {
        const parsed = marketUpdateSchema.safeParse(JSON.parse(raw));
        if (parsed.success) {
          super.apply([parsed.data as MarketUpdate]);
          n += 1;
        }
      }
      return n;
    } catch (error) {
      this.onError(error);
      return 0;
    }
  }

  override apply(updates: readonly MarketUpdate[]): MarketUpdate[] {
    const applied = super.apply(updates);
    for (const update of applied) this.dirty.set(streamKeyOf(update), update);
    if (applied.length && !this.timer) {
      this.timer = setTimeout(() => {
        this.timer = null;
        void this.flush();
      }, this.flushIntervalMs);
    }
    return applied;
  }

  override delete(keys: readonly string[]): void {
    super.delete(keys);
    for (const key of keys) this.dirty.delete(key);
    this.redis.client.hdel(HASH, ...keys).catch(this.onError);
  }

  async flush(): Promise<void> {
    if (this.dirty.size === 0) return;
    const fields: Record<string, string> = {};
    for (const [key, update] of this.dirty) fields[key] = JSON.stringify(update);
    this.dirty.clear();
    try {
      await this.redis.client.multi().hset(HASH, fields).expire(HASH, this.ttlSeconds).exec();
    } catch (error) {
      this.onError(error);
    }
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
