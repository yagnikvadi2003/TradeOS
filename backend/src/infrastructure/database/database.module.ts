import { Global, Module } from '@nestjs/common';
import { APP_ENV, type AppEnv } from '@/common/config/env';
import { RealtimeMetrics } from '@/infrastructure/realtime/realtime-metrics';
import { PrismaService } from './prisma.service';

/**
 * Optional database. Resolves to `null` when `DATABASE_URL` is unset so a
 * single-instance development deployment can run entirely in memory.
 * Production requires the URL (enforced in `loadEnv`).
 */
export const PRISMA = Symbol('PRISMA');

@Global()
@Module({
  providers: [
    {
      provide: PRISMA,
      inject: [APP_ENV, RealtimeMetrics],
      useFactory: (env: AppEnv, metrics: RealtimeMetrics): PrismaService | null =>
        env.DATABASE_URL
          ? new PrismaService(
              env.DATABASE_URL,
              env.DATABASE_POOL_MAX,
              (ms) => metrics.observeDb(ms / 1000),
              () => metrics.inc('dbErrors'),
            )
          : null,
    },
  ],
  exports: [PRISMA],
})
export class DatabaseModule {}
