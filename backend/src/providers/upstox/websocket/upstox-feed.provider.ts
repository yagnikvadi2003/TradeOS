import { randomUUID } from 'node:crypto';
import { Backoff, type BackoffOptions } from '@/infrastructure/realtime/backoff';
import { ConnectionStateMachine } from '@/infrastructure/realtime/connection-state';
import {
  type MarketStatusUpdate,
  type MarketUpdate,
  type StreamKey,
} from '@/modules/market-stream/domain/market-update';
import { type FeedStateChange, type MarketFeedProvider } from '../../feed-provider.interface';
import { UpstoxFeedCodec } from './upstox-feed.codec';
import { UpstoxFeedNormalizer } from '../mappers/upstox-feed.normalizer';
import { type FeedSocket, type FeedTransport, UpstoxAuthError } from './upstox-feed.transport';
import { type UpstoxSymbolMap } from '../mappers/upstox-symbol-map';

/** Minimal sink so the adapter stays free of the metrics class. */
export interface FeedMetricsSink {
  inc(name: string, by?: number): void;
  set(name: string, value: number | boolean | string | null): void;
  touchProviderFrame?(at: number): void;
}

export interface FeedLogger {
  info(meta: Record<string, unknown>, message: string): void;
  warn(meta: Record<string, unknown>, message: string): void;
  error(meta: Record<string, unknown>, message: string): void;
}

export interface UpstoxFeedProviderOptions {
  readonly transport: FeedTransport;
  readonly symbols: UpstoxSymbolMap;
  readonly mode: 'ltpc' | 'option_greeks' | 'full' | 'full_d30';
  readonly maxSubscriptions: number;
  readonly connectTimeoutMs: number;
  /** No frame (data or ping) for this long → DEGRADED; twice this → forced reconnect. */
  readonly staleAfterMs: number;
  readonly backoff?: Partial<BackoffOptions>;
  readonly now?: () => number;
  readonly metrics?: FeedMetricsSink;
  readonly logger?: FeedLogger;
  /** Upstream request batch size (keys per frame). */
  readonly batchSize?: number;
  /** Delay to merge rapid subscribe/unsubscribe calls into one frame. */
  readonly flushDelayMs?: number;
}

function noop(): void {
  /* default sink */
}
const NOOP_METRICS: FeedMetricsSink = { inc: noop, set: noop };
const NOOP_LOGGER: FeedLogger = { info: noop, warn: noop, error: noop };

/**
 * The single upstream connection to the Upstox V3 market feed.
 *
 * ProviderConnectionManager: state machine, connect timeout, exponential
 * backoff with jitter, stale watchdog (Upstox pings when idle, so silence is
 * a real signal), automatic resubscription, graceful stop.
 *
 * ProviderSubscriptionManager: desired set of TradeOS keys → diffed against
 * the active upstream set, batched into binary `sub`/`unsub` frames, capped
 * by the documented mode limit.
 *
 * Every frame is decoded, validated and normalized in isolation: a malformed
 * frame is counted and dropped, never able to poison the pipeline.
 */
export class UpstoxMarketFeedProvider implements MarketFeedProvider {
  readonly name = 'upstox' as const;
  readonly dataSource = 'live' as const;

  private readonly machine = new ConnectionStateMachine();
  private readonly codec = new UpstoxFeedCodec();
  private readonly normalizer: UpstoxFeedNormalizer;
  private readonly backoff: Backoff;
  private readonly now: () => number;
  private readonly metrics: FeedMetricsSink;
  private readonly log: FeedLogger;
  private readonly batchSize: number;
  private readonly flushDelayMs: number;

  private socket: FeedSocket | null = null;
  private generation = 0;
  private stopping = false;
  private started = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private watchdog: NodeJS.Timeout | null = null;
  private flushTimer: NodeJS.Timeout | null = null;
  private lastFrameAt = 0;

  /** TradeOS keys the application wants. */
  private readonly desired = new Set<StreamKey>();
  /** Upstox keys currently subscribed on the open socket. */
  private readonly active = new Set<string>();
  private readonly pendingSub = new Set<string>();
  private readonly pendingUnsub = new Set<string>();

  private readonly updateListeners = new Set<(u: readonly MarketUpdate[]) => void>();
  private readonly stateListeners = new Set<(c: FeedStateChange) => void>();
  private readonly statusListeners = new Set<(s: MarketStatusUpdate) => void>();

  constructor(private readonly options: UpstoxFeedProviderOptions) {
    this.normalizer = new UpstoxFeedNormalizer(options.symbols);
    this.now = options.now ?? (() => Date.now());
    this.metrics = options.metrics ?? NOOP_METRICS;
    this.log = options.logger ?? NOOP_LOGGER;
    this.batchSize = options.batchSize ?? 100;
    this.flushDelayMs = options.flushDelayMs ?? 25;
    this.backoff = new Backoff({
      initialMs: 1_000,
      maxMs: 60_000,
      factor: 2,
      jitter: 0.4,
      ...options.backoff,
    });
    this.machine.onChange((state, previous) => {
      this.metrics.set('providerState', state);
      this.metrics.set('providerConnected', state === 'CONNECTED' || state === 'DEGRADED');
      const change: FeedStateChange = { state, previous, at: this.now(), ...this.reasonFor(state) };
      for (const l of this.stateListeners) l(change);
    });
  }

  private lastReason: string | undefined;
  private reasonFor(state: string): { reason?: string } {
    if (state === 'RECONNECTING' || state === 'DEGRADED' || state === 'DISCONNECTED') {
      return this.lastReason ? { reason: this.lastReason } : {};
    }
    return {};
  }

  get state() {
    return this.machine.state;
  }

  get activeUpstreamCount(): number {
    return this.active.size;
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.stopping = false;
    await this.connect();
  }

  async stop(): Promise<void> {
    if (!this.started) return;
    this.stopping = true;
    this.started = false;
    this.clearTimers();
    if (!this.machine.is('DISCONNECTED')) this.machine.transition('STOPPING');
    const socket = this.socket;
    this.socket = null;
    this.generation += 1;
    if (socket?.isOpen) socket.close(1000, 'stopping');
    this.active.clear();
    this.pendingSub.clear();
    this.pendingUnsub.clear();
    if (!this.machine.is('DISCONNECTED')) this.machine.transition('DISCONNECTED');
    await Promise.resolve();
  }

  subscribe(keys: readonly StreamKey[]): void {
    for (const key of keys) {
      if (this.desired.has(key)) continue;
      const upstoxKey = this.options.symbols.upstoxKeyFor(key);
      if (!upstoxKey) {
        this.log.warn({ key }, 'feed: no provider symbol for key; ignored');
        this.metrics.inc('unmappedSubscriptions');
        continue;
      }
      this.desired.add(key);
      this.pendingUnsub.delete(upstoxKey);
      if (!this.active.has(upstoxKey)) this.pendingSub.add(upstoxKey);
    }
    this.scheduleFlush();
  }

  unsubscribe(keys: readonly StreamKey[]): void {
    for (const key of keys) {
      if (!this.desired.delete(key)) continue;
      const upstoxKey = this.options.symbols.upstoxKeyFor(key);
      if (!upstoxKey) continue;
      this.pendingSub.delete(upstoxKey);
      if (this.active.has(upstoxKey)) this.pendingUnsub.add(upstoxKey);
    }
    this.scheduleFlush();
  }

  onUpdates(listener: (updates: readonly MarketUpdate[]) => void): () => void {
    this.updateListeners.add(listener);
    return () => this.updateListeners.delete(listener);
  }

  onStateChange(listener: (change: FeedStateChange) => void): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  onMarketStatus(listener: (status: MarketStatusUpdate) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  /* ------------------------------------------------------------------ */
  /* Connection lifecycle                                                */
  /* ------------------------------------------------------------------ */

  private async connect(): Promise<void> {
    if (this.stopping) return;
    const generation = ++this.generation;
    this.machine.transition('CONNECTING');
    this.machine.transition('AUTHENTICATING');
    try {
      const socket = await this.options.transport.connect(
        {
          onOpen: noop,
          onMessage: (bytes) => this.onFrame(generation, bytes),
          onPing: () => this.touch(generation),
          onClose: (code, reason) => this.onClose(generation, code, reason),
          onError: (error) => this.log.warn({ err: error.message }, 'feed: socket error'),
        },
        this.options.connectTimeoutMs,
      );
      if (generation !== this.generation || this.stopping) {
        socket.close(1000, 'superseded');
        return;
      }
      this.socket = socket;
      this.lastFrameAt = this.now();
      this.backoff.reset();
      this.machine.transition('CONNECTED');
      this.log.info({ desired: this.desired.size }, 'feed: connected');
      // Everything the application wants must be re-established on a fresh socket.
      this.active.clear();
      this.pendingUnsub.clear();
      for (const key of this.desired) {
        const upstoxKey = this.options.symbols.upstoxKeyFor(key);
        if (upstoxKey) this.pendingSub.add(upstoxKey);
      }
      this.flush();
      this.startWatchdog();
    } catch (error) {
      if (generation !== this.generation || this.stopping) return;
      const auth = error instanceof UpstoxAuthError;
      this.metrics.inc(auth ? 'providerAuthFailures' : 'providerConnectFailures');
      this.log.error({ err: (error as Error).message, auth }, 'feed: connect failed');
      // An auth failure will not fix itself quickly; wait the maximum delay
      // instead of hammering the token endpoint.
      this.scheduleReconnect(auth ? 'auth_failed' : 'connect_failed', auth);
    }
  }

  private onClose(generation: number, code: number, reason: string): void {
    if (generation !== this.generation) return;
    this.socket = null;
    this.active.clear();
    this.stopWatchdog();
    if (this.stopping) return;
    this.log.warn({ code, reason }, 'feed: upstream closed');
    this.scheduleReconnect(`closed:${code}`);
  }

  private scheduleReconnect(reason: string, useMaxDelay = false): void {
    if (this.stopping || this.reconnectTimer) return;
    this.lastReason = reason;
    if (!this.machine.is('RECONNECTING')) this.machine.transition('RECONNECTING');
    this.metrics.inc('providerReconnects');
    const delay = useMaxDelay ? this.backoffMax() : this.backoff.next();
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, delay);
  }

  private backoffMax(): number {
    // Advance the counter so the next failure keeps widening, then cap.
    this.backoff.next();
    return this.options.backoff?.maxMs ?? 60_000;
  }

  private touch(generation: number): void {
    if (generation !== this.generation) return;
    this.lastFrameAt = this.now();
    if (this.machine.is('DEGRADED')) {
      this.machine.transition('CONNECTED');
      this.log.info({}, 'feed: data resumed');
    }
  }

  private startWatchdog(): void {
    this.stopWatchdog();
    const period = Math.max(250, Math.floor(this.options.staleAfterMs / 2));
    this.watchdog = setInterval(() => this.checkStaleness(), period);
  }

  private stopWatchdog(): void {
    if (this.watchdog) clearInterval(this.watchdog);
    this.watchdog = null;
  }

  private checkStaleness(): void {
    if (!this.socket) return;
    const age = this.now() - this.lastFrameAt;
    if (age >= this.options.staleAfterMs * 2) {
      this.metrics.inc('staleDataEvents');
      this.log.warn({ ageMs: age }, 'feed: heartbeat timeout; forcing reconnect');
      const generation = this.generation;
      const socket = this.socket;
      this.socket = null;
      this.active.clear();
      this.stopWatchdog();
      this.generation += 1; // orphan the old socket's late events
      socket.close(4000, 'heartbeat timeout');
      if (generation === this.generation - 1) this.scheduleReconnect('heartbeat_timeout');
      return;
    }
    if (age >= this.options.staleAfterMs && this.machine.is('CONNECTED')) {
      this.metrics.inc('staleDataEvents');
      this.lastReason = 'stale';
      this.machine.transition('DEGRADED');
      this.log.warn({ ageMs: age }, 'feed: no frames; degraded');
    }
  }

  private clearTimers(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = null;
    this.stopWatchdog();
  }

  /* ------------------------------------------------------------------ */
  /* Frames                                                              */
  /* ------------------------------------------------------------------ */

  private onFrame(generation: number, bytes: Uint8Array): void {
    if (generation !== this.generation) return;
    this.metrics.inc('providerMessages');
    this.metrics.touchProviderFrame?.(this.now());
    this.touch(generation);
    let normalized;
    try {
      const decoded = this.codec.decode(bytes);
      normalized = this.normalizer.normalize(decoded, this.now());
    } catch (error) {
      this.metrics.inc('invalidMessages');
      this.log.warn(
        { err: (error as Error).message, bytes: bytes.byteLength },
        'feed: frame rejected',
      );
      return;
    }
    if (normalized.unknownKeys.length)
      this.metrics.inc('unknownFeedKeys', normalized.unknownKeys.length);
    if (normalized.updates.length) for (const l of this.updateListeners) l(normalized.updates);
    for (const status of normalized.statuses) for (const l of this.statusListeners) l(status);
  }

  /* ------------------------------------------------------------------ */
  /* Upstream subscription batching                                      */
  /* ------------------------------------------------------------------ */

  private scheduleFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, this.flushDelayMs);
  }

  private flush(): void {
    const socket = this.socket;
    if (!socket?.isOpen) return; // resubscription happens on connect
    if (this.pendingUnsub.size) {
      const keys = [...this.pendingUnsub];
      this.pendingUnsub.clear();
      for (const key of keys) this.active.delete(key);
      for (const chunk of chunks(keys, this.batchSize)) this.send(socket, 'unsub', chunk);
      this.metrics.inc('upstreamUnsubscribes', keys.length);
    }
    if (this.pendingSub.size) {
      const room = this.options.maxSubscriptions - this.active.size;
      const keys = [...this.pendingSub];
      this.pendingSub.clear();
      const accepted = keys.slice(0, Math.max(0, room));
      if (accepted.length < keys.length) {
        this.metrics.inc('subscriptionLimitRejections', keys.length - accepted.length);
        this.log.warn(
          { rejected: keys.length - accepted.length, limit: this.options.maxSubscriptions },
          'feed: upstream subscription limit reached',
        );
      }
      for (const key of accepted) this.active.add(key);
      for (const chunk of chunks(accepted, this.batchSize)) this.send(socket, 'sub', chunk);
      this.metrics.inc('upstreamSubscribes', accepted.length);
    }
  }

  private send(socket: FeedSocket, method: 'sub' | 'unsub', instrumentKeys: string[]): void {
    socket.send(
      UpstoxFeedCodec.encodeRequest({
        guid: randomUUID(),
        method,
        data: { mode: this.options.mode, instrumentKeys },
      }),
    );
  }
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
