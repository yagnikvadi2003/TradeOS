import { Global, Module } from '@nestjs/common';
import { CACHE_STORE } from './cache-store.interface';
import { InMemoryCacheStore } from './in-memory-cache.store';

/**
 * Realtime state layer. Redis is optional by design (single-instance mode);
 * the Redis-backed store is added with the market data gateway.
 */
@Global()
@Module({
  providers: [{ provide: CACHE_STORE, useFactory: () => new InMemoryCacheStore() }],
  exports: [CACHE_STORE],
})
export class CacheModule {}
