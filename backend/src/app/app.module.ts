import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_ENV, type AppEnv } from '@/common/config/env';
import { ConfigModule } from '@/common/config/config.module';
import { GlobalHttpExceptionFilter } from '@/common/errors/http-exception.filter';
import { CacheModule } from '@/infrastructure/cache/cache.module';
import { DatabaseModule } from '@/infrastructure/database/database.module';
import { HealthController } from '@/infrastructure/health/health.controller';
import { LoggerModule } from '@/infrastructure/logging/logger.module';
import { OptionChainModule } from '@/modules/option-chain/option-chain.module';
import { ProviderModule } from '@/providers/provider.module';

@Module({
  imports: [
    ConfigModule,
    LoggerModule,
    DatabaseModule,
    CacheModule,
    ProviderModule,
    ThrottlerModule.forRootAsync({
      inject: [APP_ENV],
      useFactory: (env: AppEnv) => ({
        throttlers: [{ ttl: env.RATE_LIMIT_TTL_SECONDS * 1_000, limit: env.RATE_LIMIT_MAX }],
      }),
    }),
    OptionChainModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: GlobalHttpExceptionFilter },
  ],
})
export class AppModule {}
