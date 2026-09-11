import { Injectable } from '@nestjs/common';

/**
 * Process-local counters/gauges for the realtime path. Cheap increments on
 * the hot path; snapshotted by `/health` and (later) a Prometheus exporter.
 */
export interface RealtimeMetricsSnapshot {
  providerConnected: boolean;
  providerState: string;
  providerReconnects: number;
  providerMessages: number;
  normalizedMessages: number;
  invalidMessages: number;
  activeClients: number;
  activeSubscriptions: number;
  subscribedKeys: number;
  subscriptionChanges: number;
  upstreamSubscribes: number;
  upstreamUnsubscribes: number;
  fanoutMessages: number;
  fanoutUpdates: number;
  droppedMessages: number;
  coalescedUpdates: number;
  staleDataEvents: number;
  authFailures: number;
  rateLimited: number;
  websocketLatencyMsP50: number;
  websocketLatencyMsP95: number;
  websocketLatencyMsMax: number;
  /** Seconds since the last provider frame; null before the first one. */
  dataStalenessSeconds: number | null;
  redisAvailable: boolean | null;
  busKind: string;
}

import { monitorEventLoopDelay } from 'node:perf_hooks';

const LATENCY_WINDOW = 256;

/** Fixed-bucket histogram (seconds) for HTTP request duration; bounded memory. */
export const HTTP_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5] as const;
export interface HttpHistogram {
  readonly buckets: number[]; // cumulative counts per HTTP_BUCKETS entry
  count: number;
  sum: number;
}

@Injectable()
export class RealtimeMetrics {
  private readonly counters: Record<string, number> = {};
  private readonly gauges: Record<string, number | boolean | string | null> = {
    providerConnected: false,
    providerState: 'DISCONNECTED',
    activeClients: 0,
    activeSubscriptions: 0,
    subscribedKeys: 0,
    redisAvailable: null,
    busKind: 'memory',
  };
  private readonly latencies: number[] = [];
  private latencyIndex = 0;
  private readonly http = new Map<string, HttpHistogram>(); // key: `${method}|${statusClass}`
  private readonly db: HttpHistogram = {
    buckets: new Array<number>(HTTP_BUCKETS.length).fill(0),
    count: 0,
    sum: 0,
  };
  private readonly loopDelay = monitorEventLoopDelay({ resolution: 20 });

  constructor() {
    this.loopDelay.enable();
  }

  /** Database query duration (seconds); same fixed buckets as HTTP. */
  observeDb(seconds: number): void {
    this.db.count += 1;
    this.db.sum += seconds;
    for (let i = 0; i < HTTP_BUCKETS.length; i += 1)
      if (seconds <= HTTP_BUCKETS[i]!) this.db.buckets[i]! += 1;
  }

  dbHistogram(): HttpHistogram {
    return this.db;
  }

  /** Event-loop delay percentiles in ms since the last call; reset after read. */
  eventLoopDelayMs(): { p50: number; p99: number; max: number } {
    const h = this.loopDelay;
    const out = { p50: h.percentile(50) / 1e6, p99: h.percentile(99) / 1e6, max: h.max / 1e6 };
    h.reset();
    return Number.isFinite(out.p50) ? out : { p50: 0, p99: 0, max: 0 };
  }
  private lastProviderFrameAt: number | null = null;

  /** Called per provider frame; a single number write on the hot path. */
  touchProviderFrame(at = Date.now()): void {
    this.lastProviderFrameAt = at;
  }

  observeHttp(method: string, status: number, seconds: number): void {
    const key = `${method}|${Math.floor(status / 100)}xx`;
    let h = this.http.get(key);
    if (!h) {
      // Bounded: 7 methods × 5 status classes at most.
      if (this.http.size >= 40) return;
      h = { buckets: new Array<number>(HTTP_BUCKETS.length).fill(0), count: 0, sum: 0 };
      this.http.set(key, h);
    }
    h.count += 1;
    h.sum += seconds;
    for (let i = 0; i < HTTP_BUCKETS.length; i += 1)
      if (seconds <= HTTP_BUCKETS[i]!) h.buckets[i]! += 1;
  }

  httpHistograms(): ReadonlyMap<string, HttpHistogram> {
    return this.http;
  }

  inc(name: string, by = 1): void {
    this.counters[name] = (this.counters[name] ?? 0) + by;
  }

  gauge(name: string): number | boolean | string | null | undefined {
    return this.gauges[name];
  }

  set(name: string, value: number | boolean | string | null): void {
    this.gauges[name] = value;
  }

  observeLatency(ms: number): void {
    if (this.latencies.length < LATENCY_WINDOW) this.latencies.push(ms);
    else this.latencies[this.latencyIndex] = ms;
    this.latencyIndex = (this.latencyIndex + 1) % LATENCY_WINDOW;
  }

  counter(name: string): number {
    return this.counters[name] ?? 0;
  }

  snapshot(): RealtimeMetricsSnapshot {
    const sorted = [...this.latencies].sort((a, b) => a - b);
    const p50 = sorted.length ? sorted[Math.floor(sorted.length / 2)]! : 0;
    const p95 = sorted.length
      ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]!
      : 0;
    const max = sorted.length ? sorted[sorted.length - 1]! : 0;
    const c = (n: string) => this.counters[n] ?? 0;
    return {
      providerConnected: this.gauges.providerConnected as boolean,
      providerState: this.gauges.providerState as string,
      providerReconnects: c('providerReconnects'),
      providerMessages: c('providerMessages'),
      normalizedMessages: c('normalizedMessages'),
      invalidMessages: c('invalidMessages'),
      activeClients: this.gauges.activeClients as number,
      activeSubscriptions: this.gauges.activeSubscriptions as number,
      subscribedKeys: this.gauges.subscribedKeys as number,
      subscriptionChanges: c('subscriptionChanges'),
      upstreamSubscribes: c('upstreamSubscribes'),
      upstreamUnsubscribes: c('upstreamUnsubscribes'),
      fanoutMessages: c('fanoutMessages'),
      fanoutUpdates: c('fanoutUpdates'),
      droppedMessages: c('droppedMessages'),
      coalescedUpdates: c('coalescedUpdates'),
      staleDataEvents: c('staleDataEvents'),
      authFailures: c('authFailures'),
      rateLimited: c('rateLimited'),
      websocketLatencyMsP50: p50,
      websocketLatencyMsP95: p95,
      websocketLatencyMsMax: max,
      dataStalenessSeconds:
        this.lastProviderFrameAt === null
          ? null
          : Math.max(0, (Date.now() - this.lastProviderFrameAt) / 1000),
      redisAvailable: this.gauges.redisAvailable as boolean | null,
      busKind: this.gauges.busKind as string,
    };
  }
}
