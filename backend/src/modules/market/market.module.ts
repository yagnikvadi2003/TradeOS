import { Module } from '@nestjs/common';
import { MarketController } from './market.controller';
import { MarketQuotesService } from './market-quotes.service';

@Module({ controllers: [MarketController], providers: [MarketQuotesService] })
export class MarketModule {}
