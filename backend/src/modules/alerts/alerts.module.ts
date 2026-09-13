import { Module } from '@nestjs/common';
import { MarketStreamModule } from '@/modules/market-stream/market-stream.module';
import { OptionChainModule } from '@/modules/option-chain/option-chain.module';
import { AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';

@Module({
  imports: [MarketStreamModule, OptionChainModule],
  controllers: [AlertsController],
  providers: [AlertsService],
  exports: [AlertsService],
})
export class AlertsModule {}
