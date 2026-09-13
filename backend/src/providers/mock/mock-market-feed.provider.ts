import {
  type InstrumentKey,
  type OptionContractKey,
  parseOptionContractKey,
} from '@/common/market/market-primitives';
import { ConnectionStateMachine } from '@/infrastructure/realtime/connection-state';
import {
  type MarketStatusUpdate,
  type MarketUpdate,
  type StreamKey,
} from '@/modules/market-stream/domain/market-update';
import { type FeedStateChange, type MarketFeedProvider } from '../feed-provider.interface';
import { MockMarketDataProvider } from './mock-market-data.provider';

export interface MockFeedOptions {
  readonly now?: () => number;
  /** Emission cadence. The simulator's quote bucket equals this so every tick changes. */
  readonly intervalMs?: number;
  /** Test hook: drive ticks manually instead of on a timer. */
  readonly manual?: boolean;
}

/**
 * Simulated streaming feed for development and tests. Re-uses the
 * deterministic REST simulator so ticks are consistent with snapshots, and
 * exercises the same subscribe/unsubscribe/state contract as the Upstox
 * adapter. Refused in production alongside the mock REST provider.
 */
export class MockMarketFeedProvider implements MarketFeedProvider {
  readonly name = 'mock' as const;
  readonly dataSource = 'simulated' as const;
  private readonly machine = new ConnectionStateMachine();
  private readonly keys = new Set<StreamKey>();
  private readonly updateListeners = new Set<(u: readonly MarketUpdate[]) => void>();
  private readonly stateListeners = new Set<(c: FeedStateChange) => void>();
  private readonly statusListeners = new Set<(s: MarketStatusUpdate) => void>();
  private timer: NodeJS.Timeout | null = null;
  private readonly now: () => number;
  private readonly intervalMs: number;
  private readonly manual: boolean;
  private readonly source: MockMarketDataProvider;

  constructor(options: MockFeedOptions = {}) {
    this.now = options.now ?? (() => Date.now());
    this.intervalMs = options.intervalMs ?? 1_000;
    this.manual = options.manual ?? false;
    this.source = new MockMarketDataProvider({ now: this.now, bucketMs: this.intervalMs });
    this.machine.onChange((state, previous) => {
      const change = { state, previous, at: this.now() };
      for (const l of this.stateListeners) l(change);
    });
  }

  get state() {
    return this.machine.state;
  }

  async start(): Promise<void> {
    if (this.machine.is('CONNECTED')) return;
    this.machine.transition('CONNECTING');
    this.machine.transition('CONNECTED');
    if (!this.manual) this.timer = setInterval(() => void this.tick(), this.intervalMs);
    for (const l of this.statusListeners) {
      l({ exchangeCode: 'NSE', segment: 'FO', status: 'NORMAL_OPEN', timestamp: this.now() });
    }
    await Promise.resolve();
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (!this.machine.is('DISCONNECTED')) {
      this.machine.transition('STOPPING');
      this.machine.transition('DISCONNECTED');
    }
    await Promise.resolve();
  }

  subscribe(keys: readonly StreamKey[]): void {
    for (const key of keys) this.keys.add(key);
  }

  unsubscribe(keys: readonly StreamKey[]): void {
    for (const key of keys) this.keys.delete(key);
  }

  get subscribedKeys(): ReadonlySet<StreamKey> {
    return this.keys;
  }

  onUpdates(listener: (u: readonly MarketUpdate[]) => void): () => void {
    this.updateListeners.add(listener);
    return () => this.updateListeners.delete(listener);
  }

  onStateChange(listener: (c: FeedStateChange) => void): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  onMarketStatus(listener: (s: MarketStatusUpdate) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  /* ------------------------------------------------------------------ */
  /* Provider simulator — fault injection for automated tests.            */
  /* Every hook mirrors a failure a real feed can produce; none of them    */
  /* exist in the production code path.                                   */
  /* ------------------------------------------------------------------ */

  /** Upstream drops the socket → RECONNECTING. */
  simulateDisconnect(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.machine.is('CONNECTED') || this.machine.is('DEGRADED'))
      this.machine.transition('RECONNECTING');
  }

  /** Reconnect after a simulated disconnect (or silence): back to CONNECTED. */
  simulateReconnect(): void {
    if (this.machine.is('RECONNECTING')) {
      this.machine.transition('CONNECTING');
      this.machine.transition('AUTHENTICATING');
      this.machine.transition('CONNECTED');
    } else if (this.machine.is('DEGRADED')) {
      this.machine.transition('CONNECTED');
    }
    if (!this.manual && !this.timer)
      this.timer = setInterval(() => void this.tick(), this.intervalMs);
  }

  /** Feed goes silent past the stale threshold → DEGRADED (heartbeat timeout precursor). */
  simulateSilence(): void {
    if (this.machine.is('CONNECTED')) this.machine.transition('DEGRADED');
  }

  /** Heartbeat timeout: silence escalates to a forced reconnect. */
  simulateHeartbeatTimeout(): void {
    this.simulateSilence();
    if (this.machine.is('DEGRADED')) this.machine.transition('RECONNECTING');
  }

  /** Emit raw objects as if the adapter had produced them (malformed payload injection). */
  emitRaw(updates: readonly unknown[]): void {
    if (!this.machine.is('CONNECTED')) return;
    for (const l of this.updateListeners) l(updates as MarketUpdate[]);
  }

  /** The same batch delivered twice (provider replay / duplicate frame). */
  async simulateDuplicate(): Promise<void> {
    const updates = await this.generate();
    for (const l of this.updateListeners) l(updates);
    for (const l of this.updateListeners) l(updates);
  }

  /** Updates whose timestamps are older than what was already delivered. */
  async simulateStale(ageMs = 60_000): Promise<void> {
    const updates = (await this.generate()).map((u) => ({ ...u, timestamp: u.timestamp - ageMs }));
    for (const l of this.updateListeners) l(updates);
  }

  /** Data that arrives late: exchange timestamp far behind receipt time. */
  async simulateDelayed(delayMs = 5_000): Promise<void> {
    const updates = (await this.generate()).map((u) => ({
      ...u,
      receivedAt: u.receivedAt + delayMs,
    }));
    for (const l of this.updateListeners) l(updates);
  }

  /** Burst: `count` consecutive batches with monotonically newer timestamps, no yield between them. */
  async simulateBurst(count: number): Promise<void> {
    const base = await this.generate();
    for (let i = 0; i < count; i += 1) {
      const updates = base.map((u) => ({
        ...u,
        timestamp: u.timestamp + i + 1,
        receivedAt: u.receivedAt + i + 1,
      }));
      for (const l of this.updateListeners) l(updates);
    }
  }

  /** Test hook: emit one batch for every subscribed key (or inject raw updates). */
  async tick(injected?: readonly MarketUpdate[]): Promise<void> {
    if (!this.machine.is('CONNECTED')) return;
    const updates = injected ?? (await this.generate());
    if (updates.length === 0) return;
    for (const l of this.updateListeners) l(updates);
  }

  private async generate(): Promise<MarketUpdate[]> {
    const receivedAt = this.now();
    const out: MarketUpdate[] = [];
    const optionKeys: OptionContractKey[] = [];
    for (const key of this.keys) {
      if (key.includes(':OPT:')) {
        optionKeys.push(key as OptionContractKey);
        continue;
      }
      try {
        const q = await this.source.getUnderlyingQuote(key as InstrumentKey);
        out.push({
          kind: 'index',
          instrumentKey: q.instrumentKey,
          timestamp: q.updatedAt,
          receivedAt,
          ltp: q.ltp,
          previousClose: q.previousClose,
          open: q.open,
          high: q.high,
          low: q.low,
          change: q.change,
          changePercent: q.changePercent,
          volume: null,
          source: 'simulated',
        });
      } catch {
        /* unknown key: silently produce nothing, as a real feed would */
      }
    }
    if (optionKeys.length) {
      const quotes = await this.source.getOptionMarketData(optionKeys);
      for (const q of quotes) {
        const parsed = parseOptionContractKey(q.contractKey);
        if (!parsed) continue;
        out.push({
          kind: 'option',
          contractKey: q.contractKey,
          underlyingKey: `${parsed.exchangeCode}:INDEX:${parsed.underlyingSymbol}`,
          exchangeCode: parsed.exchangeCode,
          expiryDate: parsed.expiryDate,
          strike: parsed.strike,
          optionType: parsed.optionType,
          timestamp: q.updatedAt,
          receivedAt,
          ltp: q.ltp,
          previousClose: q.previousClose,
          change: q.change,
          changePercent: q.changePercent,
          volume: q.volume,
          openInterest: q.openInterest,
          openInterestChange: q.openInterestChange,
          impliedVolatility: q.impliedVolatility,
          bid: q.bid,
          ask: q.ask,
          bidQuantity: q.bidQuantity,
          askQuantity: q.askQuantity,
          greeks: q.greeks,
          source: 'simulated',
        });
      }
    }
    return out;
  }
}
