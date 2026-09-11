/**
 * instrumentKey → subscriber set, with reference counting.
 *
 * The registry is the single source of truth for "who wants what". It is
 * O(1) per operation (Map/Set) and reports the transitions that matter to
 * the upstream connection: a key's first subscriber (`added`) and its last
 * departure (`removed`). Duplicate subscriptions from the same client are
 * idempotent and never counted twice.
 */
export interface RegistryDelta {
  /** Keys that went from 0 to ≥1 subscribers. */
  readonly added: string[];
  /** Keys that went from ≥1 to 0 subscribers. */
  readonly removed: string[];
}

export class SubscriptionRegistry {
  private readonly byKey = new Map<string, Set<string>>();
  private readonly byClient = new Map<string, Set<string>>();

  subscribe(clientId: string, keys: Iterable<string>): RegistryDelta {
    const added: string[] = [];
    let mine = this.byClient.get(clientId);
    if (!mine) {
      mine = new Set();
      this.byClient.set(clientId, mine);
    }
    for (const key of keys) {
      if (mine.has(key)) continue;
      mine.add(key);
      let set = this.byKey.get(key);
      if (!set) {
        set = new Set();
        this.byKey.set(key, set);
        added.push(key);
      }
      set.add(clientId);
    }
    return { added, removed: [] };
  }

  unsubscribe(clientId: string, keys: Iterable<string>): RegistryDelta {
    const removed: string[] = [];
    const mine = this.byClient.get(clientId);
    if (!mine) return { added: [], removed };
    for (const key of keys) {
      if (!mine.delete(key)) continue;
      const set = this.byKey.get(key);
      if (!set) continue;
      set.delete(clientId);
      if (set.size === 0) {
        this.byKey.delete(key);
        removed.push(key);
      }
    }
    if (mine.size === 0) this.byClient.delete(clientId);
    return { added: [], removed };
  }

  /** Drop every subscription a client holds (disconnect). */
  removeClient(clientId: string): RegistryDelta {
    const mine = this.byClient.get(clientId);
    if (!mine) return { added: [], removed: [] };
    return this.unsubscribe(clientId, [...mine]);
  }

  subscribersOf(key: string): ReadonlySet<string> | undefined {
    return this.byKey.get(key);
  }

  subscriptionsOf(clientId: string): ReadonlySet<string> | undefined {
    return this.byClient.get(clientId);
  }

  refCount(key: string): number {
    return this.byKey.get(key)?.size ?? 0;
  }

  keys(): string[] {
    return [...this.byKey.keys()];
  }

  get keyCount(): number {
    return this.byKey.size;
  }

  get clientCount(): number {
    return this.byClient.size;
  }

  /** Total (client, key) pairs — the "active subscriptions" metric. */
  get subscriptionCount(): number {
    let n = 0;
    for (const set of this.byKey.values()) n += set.size;
    return n;
  }
}
