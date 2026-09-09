import { Module } from '@nestjs/common';
import { INSTRUMENT_CATALOG } from '@/modules/instruments/instrument.catalog';
import { PRISMA } from '@/infrastructure/database/database.module';
import { type PrismaService } from '@/infrastructure/database/prisma.service';
import { OptionChainController } from './option-chain.controller';
import { OPTION_CHAIN_REPOSITORY, type OptionChainRepository } from './option-chain.repository';
import { CLOCK, OptionChainService } from './option-chain.service';
import { InMemoryOptionChainRepository } from './repositories/in-memory-option-chain.repository';
import { PrismaOptionChainRepository } from './repositories/prisma-option-chain.repository';

@Module({
  controllers: [OptionChainController],
  providers: [
    OptionChainService,
    { provide: CLOCK, useValue: () => Date.now() },
    {
      provide: OPTION_CHAIN_REPOSITORY,
      inject: [PRISMA],
      useFactory: (prisma: PrismaService | null): OptionChainRepository =>
        prisma
          ? new PrismaOptionChainRepository(prisma)
          : new InMemoryOptionChainRepository(INSTRUMENT_CATALOG),
    },
  ],
  exports: [OptionChainService],
})
export class OptionChainModule {}
