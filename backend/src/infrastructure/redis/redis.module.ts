import { Global, Module } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { APP_ENV, type AppEnv } from '@/common/config/env';
import { connectRedis, REDIS, type RedisHandle } from './redis-client';

/**
 * Optional Redis. `REDIS` resolves to a connected handle or `null`; every
 * consumer must accept `null` and run in-process. A configured-but-down
 * Redis logs a warning and degrades to single-instance mode rather than
 * failing boot.
 */
@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [APP_ENV, Logger],
      useFactory: async (env: AppEnv, logger: Logger): Promise<RedisHandle | null> => {
        if (!env.REDIS_URL) return null;
        const handle = await connectRedis(env.REDIS_URL);
        if (!handle)
          logger.warn('Redis configured but unreachable; running in single-instance mode');
        return handle;
      },
    },
  ],
  exports: [REDIS],
})
export class RedisModule {}
