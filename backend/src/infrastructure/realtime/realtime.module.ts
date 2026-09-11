import { randomUUID } from 'node:crypto';
import { Global, Module } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { APP_ENV, type AppEnv } from '@/common/config/env';
import { REDIS, type RedisHandle } from '@/infrastructure/redis/redis-client';
import { RedisFeedLease } from '@/infrastructure/redis/redis-feed-lease';
import { RedisMarketStateStore } from '@/infrastructure/redis/redis-market-state.store';
import { RedisMessageBus } from '@/infrastructure/redis/redis-message-bus';
import { FEED_LEASE, type FeedLease, InProcessFeedLease } from './feed-lease';
import {
  InMemoryMarketStateStore,
  MARKET_STATE_STORE,
  type MarketStateStore,
} from './market-state.store';
import { InProcessMessageBus, MESSAGE_BUS, type MessageBus } from './message-bus';
import { RealtimeMetrics } from './realtime-metrics';

/**
 * Realtime infrastructure: state store, bus and feed lease. Each resolves
 * to its Redis flavour when a Redis handle exists and to the in-process
 * flavour otherwise — the same abstraction, chosen once at boot.
 */
@Global()
@Module({
  providers: [
    RealtimeMetrics,
    { provide: 'INSTANCE_ID', useFactory: () => randomUUID() },
    {
      provide: MARKET_STATE_STORE,
      inject: [REDIS, RealtimeMetrics, Logger, APP_ENV],
      useFactory: async (
        redis: RedisHandle | null,
        metrics: RealtimeMetrics,
        logger: Logger,
        env: AppEnv,
      ): Promise<MarketStateStore> => {
        // null = not configured (health: disabled); false = configured but unreachable (health: fail).
        metrics.set('redisAvailable', redis ? true : env.REDIS_URL ? false : null);
        if (!redis) return new InMemoryMarketStateStore();
        const store = new RedisMarketStateStore(redis, 250, 6 * 3600, (error) =>
          logger.warn({ err: (error as Error).message }, 'redis state store error'),
        );
        const hydrated = await store.hydrate();
        logger.log(`Hydrated ${hydrated} market state entries from Redis`);
        return store;
      },
    },
    {
      provide: MESSAGE_BUS,
      inject: [REDIS, Logger],
      useFactory: (redis: RedisHandle | null, logger: Logger): MessageBus =>
        redis
          ? new RedisMessageBus(redis, (error) =>
              logger.warn({ err: (error as Error).message }, 'redis bus error'),
            )
          : new InProcessMessageBus(),
    },
    {
      provide: FEED_LEASE,
      inject: [REDIS, 'INSTANCE_ID', Logger],
      useFactory: (redis: RedisHandle | null, instanceId: string, logger: Logger): FeedLease =>
        redis
          ? new RedisFeedLease(redis, instanceId, 15_000, (error) =>
              logger.warn({ err: (error as Error).message }, 'redis lease error'),
            )
          : new InProcessFeedLease(instanceId),
    },
  ],
  exports: [RealtimeMetrics, MARKET_STATE_STORE, MESSAGE_BUS, FEED_LEASE],
})
export class RealtimeModule {}
