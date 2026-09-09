import { Global, Module } from '@nestjs/common';
import { APP_ENV, type AppEnv } from '@/common/config/env';
import { PrismaService } from './prisma.service';

/**
 * Optional database. Resolves to `null` when `DATABASE_URL` is unset so a
 * single-instance development deployment can run entirely in memory.
 * Production requires the URL (enforced in `loadEnv`).
 */
export const PRISMA = Symbol('PRISMA');

@Global()
@Module({
  providers: [
    {
      provide: PRISMA,
      inject: [APP_ENV],
      useFactory: (env: AppEnv): PrismaService | null =>
        env.DATABASE_URL ? new PrismaService(env.DATABASE_URL) : null,
    },
  ],
  exports: [PRISMA],
})
export class DatabaseModule {}
