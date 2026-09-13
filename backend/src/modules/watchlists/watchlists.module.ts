import { Module } from '@nestjs/common';
import { WatchlistsController } from './watchlists.controller';

@Module({ controllers: [WatchlistsController] })
export class WatchlistsModule {}
