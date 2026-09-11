import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';

/**
 * Prisma client wired to the pg driver adapter with a small pool: this is
 * the durable metadata store, not a hot path, so we keep connections scarce.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(
    connectionString: string,
    poolMax = 4,
    private readonly onQuery?: (durationMs: number) => void,
    private readonly onError?: () => void,
  ) {
    super({
      adapter: new PrismaPg({ connectionString, max: poolMax, idleTimeoutMillis: 30_000 }),
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'error' },
        { emit: 'stdout', level: 'warn' },
      ],
    });
    // Query latency histogram feed; the SQL text itself is never retained.
    (this as unknown as { $on: (e: 'query', cb: (ev: { duration: number }) => void) => void }).$on(
      'query',
      (event) => this.onQuery?.(event.duration),
    );
    (this as unknown as { $on: (e: 'error', cb: () => void) => void }).$on('error', () =>
      this.onError?.(),
    );
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  async isReady(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
