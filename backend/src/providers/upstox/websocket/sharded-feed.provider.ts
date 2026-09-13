import { type ConnectionState } from '@/infrastructure/realtime/connection-state';
import {
  type MarketStatusUpdate,
  type MarketUpdate,
  type StreamKey,
} from '@/modules/market-stream/domain/market-update';
import { type FeedStateChange, type MarketFeedProvider } from '../../feed-provider.interface';

/** Anything that behaves like one upstream socket's worth of feed. */
export interface FeedShard extends MarketFeedProvider {
  readonly activeUpstreamCount: number;
}

export interface ShardedFeedOptions {
  /** Keys one shard may carry (the provider's per-connection cap). */
  readonly capacityPerShard: number;
  readonly metrics?: {
    inc(name: string, by?: number): void;
    set(name: string, v: number | boolean | string | null): void;
  };
}

/**
 * Deliberate sharding across the provider's permitted connections.
 *
 * Upstox allows two feed connections per credential and 1500 keys per
 * connection in `full` mode. This manager owns N shards (each a full
 * `UpstoxMarketFeedProvider` with its own socket, backoff and watchdog) and
 * assigns every key to exactly one shard — first-fit by remaining capacity —
 * so no key is ever subscribed twice upstream and the cap is honoured per
 * socket. Aggregate state is the *worst* shard state, so a single dead
 * socket surfaces as DEGRADED/RECONNECTING to clients rather than being
 * hidden by a healthy sibling.
 *
 * With one shard this is a transparent pass-through; the gateway does not
 * know shards exist.
 */
export class ShardedMarketFeedProvider implements MarketFeedProvider {
  readonly name: MarketFeedProvider['name'];
  readonly dataSource: MarketFeedProvider['dataSource'];
  private readonly assignment = new Map<StreamKey, number>();
  private readonly counts: number[];
  private readonly stateListeners = new Set<(c: FeedStateChange) => void>();
  private readonly shardStates: ConnectionState[];

  constructor(
    private readonly shards: readonly FeedShard[],
    private readonly options: ShardedFeedOptions,
  ) {
    if (shards.length === 0) throw new Error('ShardedMarketFeedProvider needs at least one shard');
    this.name = shards[0]!.name;
    this.dataSource = shards[0]!.dataSource;
    this.counts = shards.map(() => 0);
    this.shardStates = shards.map((s) => s.state);
    shards.forEach((shard, index) => {
      shard.onStateChange((change) => {
        this.shardStates[index] = change.state;
        const aggregate = this.state;
        for (const l of this.stateListeners) {
          l({
            ...change,
            state: aggregate,
            reason: change.reason ? `shard${index}:${change.reason}` : undefined,
          } as FeedStateChange);
        }
      });
    });
    this.options.metrics?.set('feedShards', shards.length);
  }

  /** Worst state wins so degradation is never masked. */
  get state(): ConnectionState {
    const order: ConnectionState[] = [
      'DISCONNECTED',
      'STOPPING',
      'RECONNECTING',
      'CONNECTING',
      'AUTHENTICATING',
      'DEGRADED',
      'CONNECTED',
    ];
    let worst = order.length - 1;
    for (const s of this.shardStates) worst = Math.min(worst, order.indexOf(s));
    return order[worst]!;
  }

  get shardCount(): number {
    return this.shards.length;
  }

  shardOf(key: StreamKey): number | undefined {
    return this.assignment.get(key);
  }

  async start(): Promise<void> {
    await Promise.all(this.shards.map((s) => s.start()));
  }

  async stop(): Promise<void> {
    await Promise.all(this.shards.map((s) => s.stop()));
  }

  subscribe(keys: readonly StreamKey[]): void {
    const perShard = new Map<number, StreamKey[]>();
    for (const key of keys) {
      if (this.assignment.has(key)) continue;
      const index = this.pickShard();
      if (index === -1) {
        this.options.metrics?.inc('subscriptionLimitRejections');
        continue;
      }
      this.assignment.set(key, index);
      this.counts[index] = (this.counts[index] ?? 0) + 1;
      const list = perShard.get(index) ?? [];
      list.push(key);
      perShard.set(index, list);
    }
    for (const [index, list] of perShard) this.shards[index]!.subscribe(list);
    this.options.metrics?.set('feedAssignedKeys', this.assignment.size);
  }

  unsubscribe(keys: readonly StreamKey[]): void {
    const perShard = new Map<number, StreamKey[]>();
    for (const key of keys) {
      const index = this.assignment.get(key);
      if (index === undefined) continue;
      this.assignment.delete(key);
      this.counts[index] = Math.max(0, (this.counts[index] ?? 1) - 1);
      const list = perShard.get(index) ?? [];
      list.push(key);
      perShard.set(index, list);
    }
    for (const [index, list] of perShard) this.shards[index]!.unsubscribe(list);
    this.options.metrics?.set('feedAssignedKeys', this.assignment.size);
  }

  onUpdates(listener: (updates: readonly MarketUpdate[]) => void): () => void {
    const offs = this.shards.map((s) => s.onUpdates(listener));
    return () => offs.forEach((off) => off());
  }

  onStateChange(listener: (change: FeedStateChange) => void): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  onMarketStatus(listener: (status: MarketStatusUpdate) => void): () => void {
    // Every shard receives market_info; the first shard is enough.
    return this.shards[0]!.onMarketStatus(listener);
  }

  /** First shard with room; -1 when every shard is at capacity. */
  private pickShard(): number {
    for (let i = 0; i < this.shards.length; i += 1) {
      if ((this.counts[i] ?? 0) < this.options.capacityPerShard) return i;
    }
    return -1;
  }
}
