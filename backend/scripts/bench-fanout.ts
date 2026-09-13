/**
 * Fanout throughput check for MarketDataRouter (no Nest, no sockets).
 * `pnpm --filter @tradeos/backend bench:fanout`
 */
import { RealtimeMetrics } from '../src/infrastructure/realtime/realtime-metrics';
import { SubscriptionRegistry } from '../src/infrastructure/realtime/subscription-registry';
import { type IndexTick } from '../src/modules/market-stream/domain/market-update';
import { MarketDataRouter } from '../src/modules/market-stream/market-data.router';

const CLIENTS = Number(process.env.BENCH_CLIENTS ?? 200);
const KEYS = Number(process.env.BENCH_KEYS ?? 300);
const UPDATES = Number(process.env.BENCH_UPDATES ?? 100_000);

const registry = new SubscriptionRegistry();
const router = new MarketDataRouter(registry, new RealtimeMetrics(), { flushIntervalMs: 100 });
let bytes = 0;
let frames = 0;
for (let c = 0; c < CLIENTS; c += 1) {
  const id = `c${c}`;
  router.attach({
    id,
    bufferedBytes: () => 0,
    send: () => undefined,
    sendRaw: (f) => ((bytes += f.length), (frames += 1)),
  });
  registry.subscribe(
    id,
    Array.from({ length: KEYS }, (_, k) => `K${k}`),
  );
}
const tick = (k: number, i: number): IndexTick => ({
  kind: 'index',
  instrumentKey: `K${k}` as never,
  timestamp: i,
  receivedAt: i,
  ltp: 24_000 + (i % 100),
  previousClose: 24_000,
  open: null,
  high: null,
  low: null,
  change: null,
  changePercent: null,
  volume: null,
  source: 'live',
});
const t0 = process.hrtime.bigint();
for (let i = 0; i < UPDATES; i += 1) router.route([tick(i % KEYS, i)]);
const t1 = process.hrtime.bigint();
router.flush();
const t2 = process.hrtime.bigint();
const routeMs = Number(t1 - t0) / 1e6;
const flushMs = Number(t2 - t1) / 1e6;
console.log(
  JSON.stringify({
    clients: CLIENTS,
    keys: KEYS,
    updates: UPDATES,
    routeMs: Math.round(routeMs),
    updatesPerSecRouted: Math.round(UPDATES / (routeMs / 1000)),
    flushMs: Math.round(flushMs),
    framesSent: frames,
    bytesSent: bytes,
    heapMb: Math.round(process.memoryUsage().heapUsed / 1e6),
  }),
);
router.dispose();
