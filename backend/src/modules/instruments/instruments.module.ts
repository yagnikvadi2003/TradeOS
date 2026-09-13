import { Module } from '@nestjs/common';
import { InstrumentsController } from './instruments.controller';

@Module({ controllers: [InstrumentsController] })
export class InstrumentsModule {}
