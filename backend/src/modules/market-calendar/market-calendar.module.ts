import { Module } from '@nestjs/common';
import { MarketCalendarController } from './market-calendar.controller';

@Module({ controllers: [MarketCalendarController] })
export class MarketCalendarModule {}
