import { Global, Module } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { APP_ENV, type AppEnv } from '@/common/config/env';
import { PRISMA } from '@/infrastructure/database/database.module';
import { type PrismaService } from '@/infrastructure/database/prisma.service';
import { InMemoryUserDataRepository } from './in-memory-user-data.repository';
import { PrismaUserDataRepository } from './prisma-user-data.repository';
import { USER_DATA_REPOSITORY, type UserDataRepository } from './user-data.types';

/** PostgreSQL when configured; in-memory (lost on restart) for development without a database. */
@Global()
@Module({
  providers: [
    {
      provide: USER_DATA_REPOSITORY,
      inject: [PRISMA, APP_ENV, Logger],
      useFactory: (
        prisma: PrismaService | null,
        env: AppEnv,
        logger: Logger,
      ): UserDataRepository => {
        if (prisma) return new PrismaUserDataRepository(prisma);
        if (env.NODE_ENV !== 'test')
          logger.warn('User data (watchlists, alerts, preferences) is in memory: no DATABASE_URL');
        return new InMemoryUserDataRepository();
      },
    },
  ],
  exports: [USER_DATA_REPOSITORY],
})
export class UserDataModule {}
