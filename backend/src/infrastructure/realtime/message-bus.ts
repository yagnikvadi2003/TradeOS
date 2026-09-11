/**
 * Pub/sub port between the feed pipeline and the client gateway.
 *
 * Single instance: an in-process bus (synchronous dispatch, zero copies).
 * Multi instance: Redis pub/sub carries normalized batches so every
 * instance's gateway can fan out to its own clients while only the lease
 * holder talks to the provider.
 */
export type BusHandler<T> = (message: T) => void;

export interface MessageBus {
  readonly kind: 'memory' | 'redis';
  publish<T>(channel: string, message: T): Promise<void>;
  subscribe<T>(channel: string, handler: BusHandler<T>): () => void;
}

export const MESSAGE_BUS = Symbol('MESSAGE_BUS');

export class InProcessMessageBus implements MessageBus {
  readonly kind = 'memory' as const;
  private readonly handlers = new Map<string, Set<BusHandler<unknown>>>();

  publish<T>(channel: string, message: T): Promise<void> {
    const set = this.handlers.get(channel);
    if (set) for (const handler of set) handler(message);
    return Promise.resolve();
  }

  subscribe<T>(channel: string, handler: BusHandler<T>): () => void {
    let set = this.handlers.get(channel);
    if (!set) {
      set = new Set();
      this.handlers.set(channel, set);
    }
    set.add(handler as BusHandler<unknown>);
    return () => {
      set.delete(handler as BusHandler<unknown>);
    };
  }
}

export const CHANNELS = {
  /** MarketUpdate[] batches, already validated and applied to state. */
  updates: 'tradeos:market:updates',
  /** MarketStatusUpdate. */
  status: 'tradeos:market:status',
  /** Subscription demand snapshots from every instance → feed lease holder. */
  demand: 'tradeos:market:demand',
} as const;
