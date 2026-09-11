import { marketCatalog } from '@/features/market/config';
import { simulateOptionLeg, simulateUnderlying } from '@/services/api/option-chain.simulator';
import { type MarketStream, type StreamInfo } from './market-stream';
import { type MarketUpdate, type StreamKey } from './market-stream.messages';

export interface MockMarketStreamOptions {
  readonly now?: () => number;
  readonly intervalMs?: number;
  /** Test hook: emit only when `tick()` is called. */
  readonly manual?: boolean;
}

/**
 * Simulated stream twin of the backend mock feed. Same deterministic
 * generator as the REST simulator, so ticks are consistent with snapshots.
 * Exercises the identical subscribe/refcount/info contract as the WebSocket
 * client; every update is tagged `simulated`.
 */
export class MockMarketStream implements MarketStream {
  readonly kind = 'mock' as const;
  private readonly refs = new Map<StreamKey, number>();
  private readonly updateListeners = new Set<(u: readonly MarketUpdate[]) => void>();
  private readonly infoListeners = new Set<(i: StreamInfo) => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private current: StreamInfo = {
    state: 'idle',
    reconnectAttempt: 0,
    latencyMs: null,
    provider: null,
    stale: false,
  };
  private readonly now: () => number;
  private readonly intervalMs: number;
  private readonly manual: boolean;

  constructor(options: MockMarketStreamOptions = {}) {
    this.now = options.now ?? (() => Date.now());
    this.intervalMs = options.intervalMs ?? 1_000;
    this.manual = options.manual ?? false;
  }

  get info(): StreamInfo {
    return this.current;
  }

  get retainedKeys(): ReadonlySet<StreamKey> {
    return new Set(this.refs.keys());
  }

  subscribe(keys: readonly StreamKey[]): () => void {
    for (const key of keys) this.refs.set(key, (this.refs.get(key) ?? 0) + 1);
    if (this.current.state !== 'connected') {
      this.setInfo({ state: 'connected', provider: 'CONNECTED', latencyMs: 1 });
    }
    if (!this.manual && !this.timer) this.timer = setInterval(() => this.tick(), this.intervalMs);
    // Immediate snapshot so the UI has values without waiting a full interval.
    queueMicrotask(() => this.tick(keys));
    let released = false;
    return () => {
      if (released) return;
      released = true;
      for (const key of keys) {
        const n = (this.refs.get(key) ?? 1) - 1;
        if (n <= 0) this.refs.delete(key);
        else this.refs.set(key, n);
      }
      if (this.refs.size === 0) this.disconnect();
    };
  }

  onUpdates(listener: (updates: readonly MarketUpdate[]) => void): () => void {
    this.updateListeners.add(listener);
    return () => this.updateListeners.delete(listener);
  }

  onInfo(listener: (info: StreamInfo) => void): () => void {
    this.infoListeners.add(listener);
    return () => this.infoListeners.delete(listener);
  }

  disconnect(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.setInfo({ state: 'idle', provider: null, latencyMs: null });
  }

  /** Emit one update per retained key (or the given keys). */
  tick(keys: Iterable<StreamKey> = this.refs.keys()): void {
    const bucket = this.now() - (this.now() % this.intervalMs);
    const updates: MarketUpdate[] = [];
    for (const key of keys) {
      if (!this.refs.has(key)) continue;
      const update = simulateUpdate(key, bucket);
      if (update) updates.push(update);
    }
    if (updates.length) for (const l of this.updateListeners) l(updates);
  }

  private setInfo(patch: Partial<StreamInfo>): void {
    this.current = { ...this.current, ...patch };
    for (const l of this.infoListeners) l(this.current);
  }
}

export function simulateUpdate(key: StreamKey, bucket: number): MarketUpdate | null {
  if (key.includes(':OPT:')) {
    const leg = simulateOptionLeg(key, bucket);
    if (!leg) return null;
    const { contract: c, market: m } = leg;
    return {
      kind: 'option',
      contractKey: c.contractKey,
      underlyingKey: c.underlyingKey,
      exchangeCode: c.exchangeCode,
      expiryDate: c.expiryDate,
      strike: c.strike,
      optionType: c.optionType,
      timestamp: bucket,
      receivedAt: bucket,
      ltp: m.ltp,
      previousClose: m.previousClose,
      change: m.change,
      changePercent: m.changePercent,
      volume: m.volume,
      openInterest: m.openInterest,
      openInterestChange: m.openInterestChange,
      impliedVolatility: m.impliedVolatility,
      bid: m.bid,
      ask: m.ask,
      bidQuantity: m.bidQuantity,
      askQuantity: m.askQuantity,
      greeks: m.greeks,
      source: 'simulated',
    };
  }
  if (!marketCatalog.hasInstrument(key)) return null;
  const u = simulateUnderlying(key, bucket);
  return {
    kind: 'index',
    instrumentKey: u.instrumentKey,
    timestamp: bucket,
    receivedAt: bucket,
    ltp: u.ltp,
    previousClose: u.previousClose,
    open: u.open,
    high: u.high,
    low: u.low,
    change: u.change,
    changePercent: u.changePercent,
    volume: null,
    source: 'simulated',
  };
}
