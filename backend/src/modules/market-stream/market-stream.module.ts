import { Module, type OnApplicationBootstrap } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { APP_ENV, type AppEnv } from '@/common/config/env';
import { REALTIME_TOKEN_SERVICE, RealtimeTokenService } from '@/common/realtime/realtime-auth';
import { MarketStreamGateway } from './market-stream.gateway';
import { MarketStreamService } from './market-stream.service';
import { RealtimeTokenController } from './realtime-token.controller';

@Module({
  controllers: [RealtimeTokenController],
  providers: [
    MarketStreamService,
    MarketStreamGateway,
    {
      provide: REALTIME_TOKEN_SERVICE,
      inject: [APP_ENV, Logger],
      useFactory: (env: AppEnv, logger: Logger) => {
        if (env.REALTIME_JWT_SECRET) return new RealtimeTokenService(env.REALTIME_JWT_SECRET);
        logger.warn('REALTIME_JWT_SECRET not set; using a per-process secret (development only)');
        return new RealtimeTokenService(RealtimeTokenService.generateSecret());
      },
    },
  ],
  exports: [MarketStreamService, MarketStreamGateway, REALTIME_TOKEN_SERVICE],
})
export class MarketStreamModule implements OnApplicationBootstrap {
  constructor(private readonly gateway: MarketStreamGateway) {}

  onApplicationBootstrap(): void {
    this.gateway.attach();
  }
}
