import { CoalescingQueue } from '@/infrastructure/realtime/coalescing-queue';
import { type RealtimeMetrics } from '@/infrastructure/realtime/realtime-metrics';
import { type SubscriptionRegistry } from '@/infrastructure/realtime/subscription-registry';
import { type ServerMessage } from '@/common/realtime/ws-messages';
import { type MarketUpdate, streamKeyOf } from './domain/market-update';

/** What the router needs from a connected client — the gateway adapts `ws`. */
export interface RouterClient {
  readonly id: string;
  /** Bytes queued in the socket that the peer has not consumed yet. */
  bufferedBytes(): number;
  send(message: ServerMessage): void;
  /** Send an already-serialized frame (avoids re-encoding shared updates per client). */
  sendRaw?(frame: string): void;
}

export interface RouterOptions {
  readonly flushIntervalMs: number;
  /** Per-client cap on pending keys; beyond it the oldest pending key is dropped. */
  readonly maxPendingKeys: number;
  /** Above this many unsent bytes, deltas are held (still coalescing) until the peer drains. */
  readonly backpressureBytes: number;
  /** Max updates per delta frame; the rest stays pending for the next tick. */
  readonly maxUpdatesPerFlush: number;
}

const DEFAULTS: RouterOptions = {
  flushIntervalMs: 100,
  maxPendingKeys: 2_000,
  backpressureBytes: 512 * 1024,
  maxUpdatesPerFlush: 500,
};

/**
 * Downstream half of MarketDataRouter.
 *
 * instrumentKey → subscriber set → per-client coalescing queue → one `delta`
 * frame per flush window. A key that ticks 50 times in 100 ms reaches the
 * browser once, with its latest state; a slow consumer accumulates *keys*,
 * not messages, and is skipped while its socket buffer is above the
 * backpressure line. Control frames never enter the queues.
 */
export class MarketDataRouter {
  private readonly clients = new Map<
    string,
    { client: RouterClient; queue: CoalescingQueue<MarketUpdate> }
  >();
  private readonly options: RouterOptions;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly registry: SubscriptionRegistry,
    private readonly metrics: RealtimeMetrics,
    options: Partial<RouterOptions> = {},
  ) {
    this.options = { ...DEFAULTS, ...options };
  }

  attach(client: RouterClient): void {
    this.clients.set(client.id, {
      client,
      queue: new CoalescingQueue(this.options.maxPendingKeys),
    });
    this.metrics.set('activeClients', this.clients.size);
  }

  detach(clientId: string): void {
    this.clients.delete(clientId);
    this.metrics.set('activeClients', this.clients.size);
  }

  get clientCount(): number {
    return this.clients.size;
  }

  /** Route a validated, state-applied batch to interested clients (queued, not sent). */
  route(updates: readonly MarketUpdate[]): void {
    let queued = 0;
    for (const update of updates) {
      const key = streamKeyOf(update);
      const subscribers = this.registry.subscribersOf(key);
      if (!subscribers) continue;
      for (const clientId of subscribers) {
        const entry = this.clients.get(clientId);
        if (!entry) continue;
        entry.queue.push(key, update);
        queued += 1;
      }
    }
    if (queued && !this.timer)
      this.timer = setTimeout(() => this.flush(), this.options.flushIntervalMs);
  }

  /** Send everything pending. Called on the cadence timer; exposed for tests and shutdown. */
  flush(): void {
    this.timer = null;
    let pendingRemains = false;
    // An update shared by N subscribers is serialized once per flush, not N times.
    const encoded = new Map<MarketUpdate, string>();
    const encode = (u: MarketUpdate): string => {
      let s = encoded.get(u);
      if (s === undefined) {
        s = JSON.stringify(u);
        encoded.set(u, s);
      }
      return s;
    };
    for (const { client, queue } of this.clients.values()) {
      if (queue.size === 0) continue;
      if (client.bufferedBytes() > this.options.backpressureBytes) {
        // Peer is slow: keep coalescing in place, count it, try again next tick.
        this.metrics.inc('backpressureSkips');
        pendingRemains = true;
        continue;
      }
      // Drops happen at enqueue time (bounded queue); counters are reset after each report.
      const dropped = queue.dropped;
      const updates = queue.drain(this.options.maxUpdatesPerFlush);
      if (queue.size > 0) pendingRemains = true;
      if (client.sendRaw) {
        const tail = dropped > 0 ? `],"dropped":${dropped}}` : ']}';
        client.sendRaw(`{"type":"delta","updates":[${updates.map(encode).join(',')}${tail}`);
      } else {
        client.send(dropped > 0 ? { type: 'delta', updates, dropped } : { type: 'delta', updates });
      }
      this.metrics.inc('fanoutMessages');
      this.metrics.inc('fanoutUpdates', updates.length);
      this.metrics.inc('coalescedUpdates', queue.coalesced);
      if (dropped) this.metrics.inc('droppedMessages', dropped);
      queue.resetCounters();
    }
    if (pendingRemains && !this.timer) {
      this.timer = setTimeout(() => this.flush(), this.options.flushIntervalMs);
    }
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.clients.clear();
  }
}
