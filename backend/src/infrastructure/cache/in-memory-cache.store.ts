import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { type CacheStore } from './cache-store.interface';

interface Entry {
  readonly value: unknown;
  readonly expiresAt: number;
}

/**
 * Bounded TTL map. Expired entries are dropped lazily on read and by a slow
 * sweep, so memory stays proportional to the live working set even without
 * Redis. `maxEntries` guards against unbounded key growth.
 */
@Injectable()
export class InMemoryCacheStore implements CacheStore, OnModuleDestroy {
  readonly kind = 'memory' as const;
  private readonly entries = new Map<string, Entry>();
  private readonly sweeper: NodeJS.Timeout | null;

  constructor(
    private readonly now: () => number = () => Date.now(),
    private readonly maxEntries = 2_000,
    sweepIntervalMs = 30_000,
  ) {
    this.sweeper = sweepIntervalMs > 0 ? setInterval(() => this.sweep(), sweepIntervalMs) : null;
    this.sweeper?.unref();
  }

  async get<T>(key: string): Promise<T | null> {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return null;
    }
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    if (this.entries.size >= this.maxEntries && !this.entries.has(key)) {
      this.sweep();
      if (this.entries.size >= this.maxEntries) {
        // Evict the oldest insertion; Map preserves insertion order.
        const oldest = this.entries.keys().next().value;
        if (oldest !== undefined) this.entries.delete(oldest);
      }
    }
    this.entries.set(key, { value, expiresAt: this.now() + ttlMs });
  }

  async delete(key: string): Promise<void> {
    this.entries.delete(key);
  }

  get size(): number {
    return this.entries.size;
  }

  sweep(): void {
    const now = this.now();
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(key);
    }
  }

  onModuleDestroy(): void {
    if (this.sweeper) clearInterval(this.sweeper);
  }
}
