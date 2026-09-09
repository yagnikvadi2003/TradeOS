/**
 * Realtime state / cache port. Redis implements it in multi-instance
 * deployments; the in-memory store backs single-instance and development
 * runs. Values are short-lived and never authoritative.
 */
export interface CacheStore {
  readonly kind: 'memory' | 'redis';
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlMs: number): Promise<void>;
  delete(key: string): Promise<void>;
}

export const CACHE_STORE = Symbol('CACHE_STORE');
