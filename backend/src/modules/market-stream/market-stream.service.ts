import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { isInstrumentKey, parseOptionContractKey } from '@/common/market/market-primitives';
import { type ConnectionState } from '@/infrastructure/realtime/connection-state';
import { FEED_LEASE, type FeedLease } from '@/infrastructure/realtime/feed-lease';
import {
  MARKET_STATE_STORE,
  type MarketStateStore,
} from '@/infrastructure/realtime/market-state.store';
import { CHANNELS, MESSAGE_BUS, type MessageBus } from '@/infrastructure/realtime/message-bus';
import { RealtimeMetrics } from '@/infrastructure/realtime/realtime-metrics';
import { SubscriptionRegistry } from '@/infrastructure/realtime/subscription-registry';
import { catalogInstrument } from '@/modules/instruments/instrument.catalog';
import { MARKET_FEED_PROVIDER, type MarketFeedProvider } from '@/providers/feed-provider.interface';
import { marketUpdateSchema } from './domain/market-update.schemas';
import { type MarketStatusUpdate, type MarketUpdate, type StreamKey } from './domain/market-update';

export interface SubscribeResult {
  readonly accepted: StreamKey[];
  readonly rejected: string[];
  /** Current state for accepted keys the store already knows. */
  readonly snapshot: MarketUpdate[];
}

export interface StreamStatus {
  readonly provider: ConnectionState;
  readonly stale: boolean;
  readonly markets: MarketStatusUpdate[];
}

interface DemandMessage {
  readonly instanceId: string;
  readonly added: StreamKey[];
  readonly removed: StreamKey[];
  /** Full re-announcement (heartbeat): replaces the leader's view of this instance. */
  readonly full?: boolean;
}

/** Non-leaders re-announce every 30 s; the leader forgets an instance silent for 90 s. */
const DEMAND_HEARTBEAT_MS = 30_000;
const DEMAND_TTL_MS = 90_000;
interface StatusMessage {
  readonly provider: ConnectionState;
  readonly stale: boolean;
  readonly market?: MarketStatusUpdate;
}

/**
 * MarketDataRouter's upstream half and the heart of the pipeline:
 *
 *   feed ──updates──▶ validate ──▶ state store ──▶ bus ──▶ local listeners (router)
 *   clients ──subscribe──▶ registry (refcount) ──first/last──▶ feed.subscribe / unsubscribe
 *
 * With Redis, only the lease holder runs the feed; other instances forward
 * subscription *demand* over the bus and receive updates back over it, so
 * 100 users on 3 instances still mean one upstream connection and one
 * upstream subscription per instrument.
 */
@Injectable()
export class MarketStreamService implements OnModuleInit, OnModuleDestroy {
  readonly registry = new SubscriptionRegistry();
  /** Demand from other instances (lease holder only): instanceId → keys. */
  private readonly remoteDemand = new Map<string, Set<StreamKey>>();
  private readonly remoteSeenAt = new Map<string, number>();
  private demandTimer: NodeJS.Timeout | null = null;
  private readonly upstreamRefs = new Map<StreamKey, number>();
  private readonly updateListeners = new Set<(updates: readonly MarketUpdate[]) => void>();
  private readonly statusListeners = new Set<(status: StreamStatus) => void>();
  private readonly markets = new Map<string, MarketStatusUpdate>();
  private readonly disposers: (() => void)[] = [];
  private providerState: ConnectionState = 'DISCONNECTED';
  private stale = false;
  private isLeader = false;
  private feedStarted = false;

  constructor(
    @Inject(MARKET_FEED_PROVIDER) private readonly feed: MarketFeedProvider,
    @Inject(MARKET_STATE_STORE) private readonly state: MarketStateStore,
    @Inject(MESSAGE_BUS) private readonly bus: MessageBus,
    @Inject(FEED_LEASE) private readonly lease: FeedLease,
    private readonly metrics: RealtimeMetrics,
    private readonly logger: Logger,
  ) {}

  async onModuleInit(): Promise<void> {
    this.metrics.set('busKind', this.bus.kind);
    // Updates travel over the bus in every topology so the router code path is identical.
    this.disposers.push(
      this.bus.subscribe<MarketUpdate[]>(CHANNELS.updates, (batch) => this.onBusUpdates(batch)),
      this.bus.subscribe<StatusMessage>(CHANNELS.status, (msg) => this.onBusStatus(msg)),
      this.bus.subscribe<DemandMessage>(CHANNELS.demand, (msg) => this.onRemoteDemand(msg)),
      this.feed.onUpdates((updates) => this.onFeedUpdates(updates)),
      this.feed.onStateChange((change) => {
        this.stale = change.state === 'DEGRADED' || change.state === 'RECONNECTING';
        if (change.state === 'DEGRADED') this.metrics.inc('staleDataEvents');
        void this.bus.publish<StatusMessage>(CHANNELS.status, {
          provider: change.state,
          stale: this.stale,
        });
      }),
      this.feed.onMarketStatus((status) => {
        void this.bus.publish<StatusMessage>(CHANNELS.status, {
          provider: this.feed.state,
          stale: this.stale,
          market: status,
        });
      }),
      this.lease.onChange((isLeader) => void this.onLeadership(isLeader)),
    );
    const leader = await this.lease.acquire();
    await this.onLeadership(leader);
    if (this.bus.kind !== 'memory') {
      this.demandTimer = setInterval(() => this.demandHeartbeat(), DEMAND_HEARTBEAT_MS);
      this.demandTimer.unref();
    }
  }

  /** Leader: expire silent instances. Follower: re-announce full demand. */
  private demandHeartbeat(): void {
    if (this.isLeader) {
      const now = Date.now();
      for (const [instanceId, seenAt] of this.remoteSeenAt) {
        if (now - seenAt > DEMAND_TTL_MS) {
          const keys = [...(this.remoteDemand.get(instanceId) ?? [])];
          this.remoteDemand.delete(instanceId);
          this.remoteSeenAt.delete(instanceId);
          if (keys.length) this.retainUpstream(instanceId, [], keys);
          this.metrics.inc('expiredRemoteInstances');
        }
      }
      return;
    }
    void this.bus.publish<DemandMessage>(CHANNELS.demand, {
      instanceId: this.lease.instanceId,
      added: this.registry.keys() as StreamKey[],
      removed: [],
      full: true,
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.demandTimer) clearInterval(this.demandTimer);
    this.demandTimer = null;
    for (const dispose of this.disposers) dispose();
    if (this.feedStarted) await this.feed.stop();
    await this.lease.release();
  }

  /* ------------------------------------------------------------------ */
  /* Client-facing                                                       */
  /* ------------------------------------------------------------------ */

  get status(): StreamStatus {
    return { provider: this.providerState, stale: this.stale, markets: [...this.markets.values()] };
  }

  onUpdates(listener: (updates: readonly MarketUpdate[]) => void): () => void {
    this.updateListeners.add(listener);
    return () => this.updateListeners.delete(listener);
  }

  onStatus(listener: (status: StreamStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  /** Authorization: only catalog instruments, and only option contracts of option-chain underlyings. */
  static isAuthorizedKey(key: string, scope: readonly string[]): key is StreamKey {
    if (!scope.includes('*') && !scope.includes(key)) return false;
    if (isInstrumentKey(key)) return catalogInstrument(key) !== null;
    const parsed = parseOptionContractKey(key);
    if (!parsed) return false;
    const underlying = catalogInstrument(`${parsed.exchangeCode}:INDEX:${parsed.underlyingSymbol}`);
    return underlying?.hasOptionChain === true;
  }

  subscribe(clientId: string, keys: readonly string[], scope: readonly string[]): SubscribeResult {
    const accepted: StreamKey[] = [];
    const rejected: string[] = [];
    for (const key of keys) {
      if (MarketStreamService.isAuthorizedKey(key, scope)) accepted.push(key);
      else rejected.push(key);
    }
    const delta = this.registry.subscribe(clientId, accepted);
    this.applyDelta(delta.added as StreamKey[], []);
    this.refreshGauges();
    return { accepted, rejected, snapshot: this.state.getMany(accepted) };
  }

  unsubscribe(clientId: string, keys: readonly string[]): StreamKey[] {
    const delta = this.registry.unsubscribe(clientId, keys);
    this.applyDelta([], delta.removed as StreamKey[]);
    this.refreshGauges();
    return keys as StreamKey[];
  }

  removeClient(clientId: string): void {
    const delta = this.registry.removeClient(clientId);
    this.applyDelta([], delta.removed as StreamKey[]);
    this.refreshGauges();
  }

  /* ------------------------------------------------------------------ */
  /* Upstream demand                                                     */
  /* ------------------------------------------------------------------ */

  private applyDelta(added: readonly StreamKey[], removed: readonly StreamKey[]): void {
    if (added.length === 0 && removed.length === 0) return;
    this.metrics.inc('subscriptionChanges', added.length + removed.length);
    if (this.isLeader) {
      this.retainUpstream(this.lease.instanceId, added, removed);
    } else {
      void this.bus.publish<DemandMessage>(CHANNELS.demand, {
        instanceId: this.lease.instanceId,
        added: [...added],
        removed: [...removed],
      });
    }
  }

  private onRemoteDemand(msg: DemandMessage): void {
    if (!this.isLeader || msg.instanceId === this.lease.instanceId) return;
    this.remoteSeenAt.set(msg.instanceId, Date.now());
    let keys = this.remoteDemand.get(msg.instanceId);
    if (!keys) {
      keys = new Set();
      this.remoteDemand.set(msg.instanceId, keys);
    }
    const wanted = new Set(msg.added);
    const added = msg.added.filter((k) => !keys.has(k));
    const removed = msg.full
      ? [...keys].filter((k) => !wanted.has(k))
      : msg.removed.filter((k) => keys.has(k));
    for (const k of added) keys.add(k);
    for (const k of removed) keys.delete(k);
    this.retainUpstream(msg.instanceId, added, removed);
  }

  /** Reference count across instances → one upstream subscription per key. */
  private retainUpstream(
    _instanceId: string,
    added: readonly StreamKey[],
    removed: readonly StreamKey[],
  ): void {
    const toSubscribe: StreamKey[] = [];
    const toUnsubscribe: StreamKey[] = [];
    for (const key of added) {
      const n = (this.upstreamRefs.get(key) ?? 0) + 1;
      this.upstreamRefs.set(key, n);
      if (n === 1) toSubscribe.push(key);
    }
    for (const key of removed) {
      const n = (this.upstreamRefs.get(key) ?? 0) - 1;
      if (n <= 0) {
        this.upstreamRefs.delete(key);
        toUnsubscribe.push(key);
      } else {
        this.upstreamRefs.set(key, n);
      }
    }
    if (toSubscribe.length) this.feed.subscribe(toSubscribe);
    if (toUnsubscribe.length) {
      this.feed.unsubscribe(toUnsubscribe);
      // Drop state for keys nobody wants any more so memory stays bounded.
      this.state.delete(toUnsubscribe);
    }
  }

  private async onLeadership(isLeader: boolean): Promise<void> {
    if (isLeader === this.isLeader && this.feedStarted === isLeader) return;
    this.isLeader = isLeader;
    this.metrics.set('feedLeader', isLeader);
    if (isLeader) {
      // Re-derive upstream demand from local registry (remote demand re-announces itself).
      this.upstreamRefs.clear();
      this.retainUpstream(this.lease.instanceId, this.registry.keys() as StreamKey[], []);
      if (!this.feedStarted) {
        this.feedStarted = true;
        try {
          await this.feed.start();
        } catch (error) {
          this.logger.error({ err: (error as Error).message }, 'market feed failed to start');
        }
      }
    } else if (this.feedStarted) {
      this.feedStarted = false;
      this.remoteDemand.clear();
      this.upstreamRefs.clear();
      await this.feed.stop();
      // Announce our demand to whichever instance now holds the lease.
      const keys = this.registry.keys() as StreamKey[];
      if (keys.length) {
        void this.bus.publish<DemandMessage>(CHANNELS.demand, {
          instanceId: this.lease.instanceId,
          added: keys,
          removed: [],
        });
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Data path                                                           */
  /* ------------------------------------------------------------------ */

  private onFeedUpdates(updates: readonly MarketUpdate[]): void {
    // Second validation at the domain boundary: an adapter bug must not reach clients.
    const valid: MarketUpdate[] = [];
    for (const update of updates) {
      const parsed = marketUpdateSchema.safeParse(update);
      if (parsed.success) valid.push(parsed.data as MarketUpdate);
      else this.metrics.inc('invalidMessages');
    }
    if (valid.length === 0) return;
    this.metrics.inc('normalizedMessages', valid.length);
    if (this.feed.name === 'mock') this.metrics.touchProviderFrame();
    if (this.bus.kind === 'memory') {
      this.onBusUpdates(valid);
    } else {
      void this.bus.publish(CHANNELS.updates, valid);
    }
  }

  private onBusUpdates(batch: readonly MarketUpdate[]): void {
    const applied = this.state.apply(batch);
    if (applied.length === 0) return;
    for (const l of this.updateListeners) l(applied);
  }

  private onBusStatus(msg: StatusMessage): void {
    this.providerState = msg.provider;
    this.stale = msg.stale;
    this.metrics.set('providerState', msg.provider);
    this.metrics.set(
      'providerConnected',
      msg.provider === 'CONNECTED' || msg.provider === 'DEGRADED',
    );
    if (msg.market)
      this.markets.set(`${msg.market.exchangeCode}:${msg.market.segment}`, msg.market);
    const status = this.status;
    for (const l of this.statusListeners) l(status);
  }

  private refreshGauges(): void {
    this.metrics.set('activeSubscriptions', this.registry.subscriptionCount);
    this.metrics.set('subscribedKeys', this.registry.keyCount);
  }
}
