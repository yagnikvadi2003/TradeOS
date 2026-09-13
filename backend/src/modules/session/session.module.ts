import { Global, Module } from '@nestjs/common';
import { MarketStreamModule } from '@/modules/market-stream/market-stream.module';
import { SessionController } from './session.controller';
import { SessionGuard } from './session.guard';
import { SessionService } from './session.service';

@Global()
@Module({
  imports: [MarketStreamModule],
  controllers: [SessionController],
  providers: [SessionService, SessionGuard],
  exports: [SessionService, SessionGuard],
})
export class SessionModule {}
