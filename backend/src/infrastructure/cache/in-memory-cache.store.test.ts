import { describe, expect, it } from 'vitest';
import { InMemoryCacheStore } from './in-memory-cache.store';

describe('InMemoryCacheStore', () => {
  it('expires entries by TTL using the injected clock', async () => {
    let now = 1_000;
    const store = new InMemoryCacheStore(() => now, 10, 0);
    await store.set('a', { v: 1 }, 500);
    expect(await store.get('a')).toEqual({ v: 1 });
    now = 1_499;
    expect(await store.get('a')).toEqual({ v: 1 });
    now = 1_500;
    expect(await store.get('a')).toBeNull();
    expect(store.size).toBe(0);
  });

  it('bounds memory by evicting the oldest entry once full', async () => {
    const store = new InMemoryCacheStore(() => 0, 2, 0);
    await store.set('a', 1, 1_000);
    await store.set('b', 2, 1_000);
    await store.set('c', 3, 1_000);
    expect(store.size).toBe(2);
    expect(await store.get('a')).toBeNull();
    expect(await store.get('c')).toBe(3);
  });
});
