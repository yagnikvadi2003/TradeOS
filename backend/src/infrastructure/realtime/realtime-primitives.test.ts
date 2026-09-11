import { describe, expect, it } from 'vitest';
import { Backoff } from './backoff';
import { CoalescingQueue } from './coalescing-queue';
import { canTransition, ConnectionStateMachine } from './connection-state';
import { SubscriptionRegistry } from './subscription-registry';

describe('SubscriptionRegistry', () => {
  it('counts a key once per client and reports first/last transitions', () => {
    const r = new SubscriptionRegistry();
    expect(r.subscribe('a', ['K1', 'K1', 'K2'])).toEqual({ added: ['K1', 'K2'], removed: [] });
    expect(r.subscribe('a', ['K1'])).toEqual({ added: [], removed: [] }); // duplicate
    expect(r.subscribe('b', ['K1'])).toEqual({ added: [], removed: [] }); // second client, same key
    expect(r.refCount('K1')).toBe(2);
    expect(r.subscriptionCount).toBe(3);
    expect(r.keyCount).toBe(2);
    expect(r.unsubscribe('a', ['K1'])).toEqual({ added: [], removed: [] });
    expect(r.refCount('K1')).toBe(1);
    expect(r.unsubscribe('b', ['K1'])).toEqual({ added: [], removed: ['K1'] });
    expect(r.refCount('K1')).toBe(0);
    expect(r.unsubscribe('zzz', ['K2'])).toEqual({ added: [], removed: [] });
  });

  it('drops every key of a disconnecting client', () => {
    const r = new SubscriptionRegistry();
    r.subscribe('a', ['K1', 'K2']);
    r.subscribe('b', ['K2']);
    expect(r.removeClient('a')).toEqual({ added: [], removed: ['K1'] });
    expect(r.subscribersOf('K2')).toEqual(new Set(['b']));
    expect(r.subscriptionsOf('a')).toBeUndefined();
    expect(r.clientCount).toBe(1);
  });
});

describe('CoalescingQueue', () => {
  it('keeps only the latest value per key and bounds growth', () => {
    const q = new CoalescingQueue<number>(3);
    q.push('a', 1);
    q.push('a', 2);
    q.push('b', 1);
    expect(q.size).toBe(2);
    expect(q.coalesced).toBe(1);
    q.push('c', 1);
    q.push('d', 1); // over capacity: oldest ('a') dropped
    expect(q.size).toBe(3);
    expect(q.dropped).toBe(1);
    expect(q.drain()).toEqual([1, 1, 1]);
    expect(q.size).toBe(0);
  });

  it('drains at most `limit` and keeps the rest pending', () => {
    const q = new CoalescingQueue<string>(10);
    for (const k of ['a', 'b', 'c']) q.push(k, k);
    expect(q.drain(2)).toEqual(['a', 'b']);
    expect(q.size).toBe(1);
  });
});

describe('Backoff', () => {
  it('grows exponentially with jitter and never exceeds the cap', () => {
    const b = new Backoff({ initialMs: 100, maxMs: 1_000, jitter: 0.5, random: () => 0.5 });
    expect(b.next()).toBe(100);
    expect(b.next()).toBe(200);
    expect(b.next()).toBe(400);
    expect(b.next()).toBe(800);
    expect(b.next()).toBe(1_000);
    expect(b.next()).toBe(1_000);
    b.reset();
    expect(b.next()).toBe(100);
  });

  it('spreads delays across the jitter window', () => {
    const low = new Backoff({ initialMs: 1_000, maxMs: 10_000, jitter: 0.4, random: () => 0 });
    const high = new Backoff({ initialMs: 1_000, maxMs: 10_000, jitter: 0.4, random: () => 1 });
    expect(low.next()).toBe(800);
    expect(high.next()).toBe(1_200);
  });
});

describe('ConnectionStateMachine', () => {
  it('walks the documented lifecycle and refuses illegal jumps', () => {
    const m = new ConnectionStateMachine();
    const seen: string[] = [];
    m.onChange((s) => seen.push(s));
    for (const s of [
      'CONNECTING',
      'AUTHENTICATING',
      'CONNECTED',
      'DEGRADED',
      'RECONNECTING',
      'CONNECTING',
      'CONNECTED',
      'STOPPING',
      'DISCONNECTED',
    ] as const) {
      m.transition(s);
    }
    expect(seen).toHaveLength(9);
    expect(() => m.transition('CONNECTED')).toThrow(/Illegal/);
    expect(canTransition('DISCONNECTED', 'DEGRADED')).toBe(false);
    expect(canTransition('STOPPING', 'DISCONNECTED')).toBe(true);
  });
});
