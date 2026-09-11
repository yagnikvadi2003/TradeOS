import { Controller, Get, Header, Inject, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiOperation, ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';
import { HTTP_BUCKETS, RealtimeMetrics } from '@/infrastructure/realtime/realtime-metrics';
import { REDIS, type RedisHandle } from '@/infrastructure/redis/redis-client';

/**
 * Prometheus text exposition. Hand-rolled on purpose: one endpoint, no
 * collector timers, nothing running when nobody scrapes. Redis latency is
 * measured by a single PING on scrape (bounded to 250 ms).
 *
 * Metric names follow `infrastructure/grafana/tradeos-dashboard.json`.
 */
@ApiTags('metrics')
@Controller({ path: 'metrics', version: VERSION_NEUTRAL })
export class MetricsController {
  private lastCpu = process.cpuUsage();
  private lastCpuAt = process.hrtime.bigint();

  constructor(
    private readonly metrics: RealtimeMetrics,
    @Inject(REDIS) private readonly redis: RedisHandle | null,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Prometheus text exposition (computed on scrape)' })
  @ApiProduces('text/plain')
  @ApiResponse({
    status: 200,
    description: 'Metric families: market_*, http_*, redis_*, db_*, process_*, nodejs_*',
  })
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  async scrape(): Promise<string> {
    const s = this.metrics.snapshot();
    const mem = process.memoryUsage();
    const cpu = process.cpuUsage();
    const lines: string[] = [];
    const gauge = (name: string, value: number | boolean | null, help: string, labels = '') => {
      lines.push(
        `# HELP ${name} ${help}`,
        `# TYPE ${name} gauge`,
        `${name}${labels} ${value === null ? 'NaN' : Number(value)}`,
      );
    };
    const counter = (name: string, value: number, help: string, labels = '') => {
      lines.push(`# HELP ${name} ${help}`, `# TYPE ${name} counter`, `${name}${labels} ${value}`);
    };

    gauge(
      'market_provider_connection',
      s.providerConnected,
      'Upstream market feed connected (1) or not (0)',
    );
    lines.push(`market_provider_state_info{state="${s.providerState}"} 1`);
    counter('market_provider_reconnect_total', s.providerReconnects, 'Upstream reconnect attempts');
    counter(
      'market_provider_messages_total',
      s.providerMessages,
      'Frames received from the provider',
    );
    counter(
      'market_data_normalized_total',
      s.normalizedMessages,
      'Validated market updates entering the pipeline',
    );
    counter(
      'market_data_invalid_total',
      s.invalidMessages,
      'Frames or updates rejected by validation',
    );
    counter(
      'market_data_dropped_total',
      s.droppedMessages,
      'Updates dropped by bounded per-client queues',
    );
    counter(
      'market_data_coalesced_total',
      s.coalescedUpdates,
      'Updates superseded before send (latest-state-wins)',
    );
    counter(
      'market_data_stale_events_total',
      s.staleDataEvents,
      'Feed stale / heartbeat-timeout events',
    );
    gauge(
      'market_data_staleness_seconds',
      s.dataStalenessSeconds,
      'Seconds since the last provider frame',
    );
    gauge('market_ws_clients', s.activeClients, 'Authenticated WebSocket clients');
    gauge('market_ws_subscriptions', s.activeSubscriptions, 'Client subscriptions (client × key)');
    gauge('market_ws_subscribed_keys', s.subscribedKeys, 'Distinct subscribed stream keys');
    counter(
      'market_ws_subscription_changes_total',
      s.subscriptionChanges,
      'Upstream demand changes',
    );
    counter('market_ws_fanout_total', s.fanoutMessages, 'Delta frames sent to clients');
    counter('market_ws_fanout_updates_total', s.fanoutUpdates, 'Updates carried in delta frames');
    counter(
      'market_ws_backpressure_skips_total',
      this.metrics.counter('backpressureSkips'),
      'Flushes skipped for slow clients',
    );
    counter('market_ws_auth_failures_total', s.authFailures, 'WebSocket authentication failures');
    counter(
      'market_ws_rate_limited_total',
      s.rateLimited,
      'WebSocket messages rejected by rate limit',
    );
    counter(
      'market_ws_rejected_connections_total',
      this.metrics.counter('rejectedConnections') + this.metrics.counter('rejectedOrigins'),
      'Upgrades rejected (limits, origin)',
    );
    gauge(
      'market_ws_latency_ms',
      s.websocketLatencyMsP50,
      'Client heartbeat round trip',
      '{quantile="0.5"}',
    );
    gauge(
      'market_ws_latency_ms',
      s.websocketLatencyMsP95,
      'Client heartbeat round trip',
      '{quantile="0.95"}',
    );
    gauge(
      'market_ws_latency_ms',
      s.websocketLatencyMsMax,
      'Client heartbeat round trip',
      '{quantile="1"}',
    );

    const redisLatency = await this.pingRedis();
    gauge(
      'redis_available',
      s.redisAvailable === null ? null : redisLatency !== null,
      'Redis reachable (NaN when not configured)',
    );
    gauge('redis_latency_ms', redisLatency, 'Redis PING round trip measured on scrape');

    lines.push(
      '# HELP http_request_duration_seconds HTTP request duration',
      '# TYPE http_request_duration_seconds histogram',
    );
    for (const [key, h] of this.metrics.httpHistograms()) {
      const [method, status] = key.split('|') as [string, string];
      const labels = `method="${method}",status="${status}"`;
      HTTP_BUCKETS.forEach((le, i) =>
        lines.push(`http_request_duration_seconds_bucket{${labels},le="${le}"} ${h.buckets[i]}`),
      );
      lines.push(
        `http_request_duration_seconds_bucket{${labels},le="+Inf"} ${h.count}`,
        `http_request_duration_seconds_sum{${labels}} ${h.sum}`,
        `http_request_duration_seconds_count{${labels}} ${h.count}`,
      );
    }
    const db = this.metrics.dbHistogram();
    lines.push(
      '# HELP db_query_duration_seconds Prisma query duration',
      '# TYPE db_query_duration_seconds histogram',
    );
    HTTP_BUCKETS.forEach((le, i) =>
      lines.push(`db_query_duration_seconds_bucket{le="${le}"} ${db.buckets[i]}`),
    );
    lines.push(
      `db_query_duration_seconds_bucket{le="+Inf"} ${db.count}`,
      `db_query_duration_seconds_sum ${db.sum}`,
      `db_query_duration_seconds_count ${db.count}`,
    );
    counter('db_errors_total', this.metrics.counter('dbErrors'), 'Prisma client errors');
    const loop = this.metrics.eventLoopDelayMs();
    gauge(
      'nodejs_eventloop_lag_ms',
      loop.p50,
      'Event-loop delay since last scrape',
      '{quantile="0.5"}',
    );
    gauge(
      'nodejs_eventloop_lag_ms',
      loop.p99,
      'Event-loop delay since last scrape',
      '{quantile="0.99"}',
    );
    gauge(
      'nodejs_eventloop_lag_ms',
      loop.max,
      'Event-loop delay since last scrape',
      '{quantile="1"}',
    );
    counter(
      'http_errors_total',
      this.metrics.counter('httpErrors4xx'),
      'HTTP responses by error class',
      '{class="4xx"}',
    );
    counter(
      'http_errors_total',
      this.metrics.counter('httpErrors5xx'),
      'HTTP responses by error class',
      '{class="5xx"}',
    );

    const now = process.hrtime.bigint();
    const elapsedS = Number(now - this.lastCpuAt) / 1e9;
    const usedS = (cpu.user - this.lastCpu.user + cpu.system - this.lastCpu.system) / 1e6;
    this.lastCpu = cpu;
    this.lastCpuAt = now;
    gauge(
      'process_cpu_percent',
      elapsedS > 0 ? Math.min(100, (usedS / elapsedS) * 100) : 0,
      'CPU utilisation since last scrape',
    );
    counter('process_cpu_seconds_total', (cpu.user + cpu.system) / 1e6, 'Total CPU time');
    gauge('process_memory_rss_bytes', mem.rss, 'Resident memory');
    gauge('process_memory_heap_used_bytes', mem.heapUsed, 'V8 heap used');
    gauge('process_memory_heap_total_bytes', mem.heapTotal, 'V8 heap allocated');
    gauge('process_uptime_seconds', Math.round(process.uptime()), 'Process uptime');
    return `${lines.join('\n')}\n`;
  }

  private async pingRedis(): Promise<number | null> {
    if (!this.redis) return null;
    const started = process.hrtime.bigint();
    try {
      const ok = await Promise.race([
        this.redis.client.ping().then(() => true),
        new Promise<false>((resolve) => setTimeout(() => resolve(false), 250).unref()),
      ]);
      if (!ok) return null;
      return Number(process.hrtime.bigint() - started) / 1e6;
    } catch {
      return null;
    }
  }
}
