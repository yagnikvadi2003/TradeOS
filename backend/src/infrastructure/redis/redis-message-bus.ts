import { type BusHandler, type MessageBus } from '@/infrastructure/realtime/message-bus';
import { type RedisHandle } from './redis-client';

/**
 * Redis pub/sub bus. Messages are JSON; one channel per topic. Handlers are
 * fanned out in-process, so N local subscribers cost one Redis subscription.
 */
function ignore(): void {
  /* errors are optional to observe */
}

export class RedisMessageBus implements MessageBus {
  readonly kind = 'redis' as const;
  private readonly handlers = new Map<string, Set<BusHandler<unknown>>>();
  private readonly onError: (error: unknown) => void;

  constructor(
    private readonly redis: RedisHandle,
    onError: (error: unknown) => void = ignore,
  ) {
    this.onError = onError;
    this.redis.subscriber.on('message', (channel: string, payload: string) => {
      const set = this.handlers.get(channel);
      if (!set) return;
      let message: unknown;
      try {
        message = JSON.parse(payload);
      } catch (error) {
        this.onError(error);
        return;
      }
      for (const handler of set) handler(message);
    });
  }

  async publish<T>(channel: string, message: T): Promise<void> {
    try {
      await this.redis.client.publish(channel, JSON.stringify(message));
    } catch (error) {
      this.onError(error);
    }
  }

  subscribe<T>(channel: string, handler: BusHandler<T>): () => void {
    let set = this.handlers.get(channel);
    if (!set) {
      set = new Set();
      this.handlers.set(channel, set);
      this.redis.subscriber.subscribe(channel).catch(this.onError);
    }
    set.add(handler as BusHandler<unknown>);
    return () => {
      set.delete(handler as BusHandler<unknown>);
      if (set.size === 0) {
        this.handlers.delete(channel);
        this.redis.subscriber.unsubscribe(channel).catch(this.onError);
      }
    };
  }
}
