/**
 * Bounded, key-coalescing queue for market updates.
 *
 * Market data is idempotent per key: only the latest state matters, so a
 * newer update for a key *replaces* the pending one instead of queueing
 * behind it. Growth is therefore bounded by the number of distinct keys, and
 * a hard `maxKeys` cap protects against a runaway subscriber set: when it is
 * hit, the oldest pending key is dropped and counted.
 *
 * Control messages (auth, errors, heartbeats) never go through this queue.
 */
export class CoalescingQueue<T> {
  private readonly pending = new Map<string, T>();
  private droppedCount = 0;
  private coalescedCount = 0;

  constructor(private readonly maxKeys: number) {}

  get size(): number {
    return this.pending.size;
  }

  get dropped(): number {
    return this.droppedCount;
  }

  get coalesced(): number {
    return this.coalescedCount;
  }

  push(key: string, value: T): void {
    if (this.pending.has(key)) {
      this.coalescedCount += 1;
      this.pending.delete(key); // re-insert at the tail: newest state goes out last-but-once
    } else if (this.pending.size >= this.maxKeys) {
      const oldest = this.pending.keys().next().value;
      if (oldest !== undefined) {
        this.pending.delete(oldest);
        this.droppedCount += 1;
      }
    }
    this.pending.set(key, value);
  }

  /** Remove and return everything pending, oldest key first. */
  drain(limit = Number.POSITIVE_INFINITY): T[] {
    const out: T[] = [];
    for (const [key, value] of this.pending) {
      if (out.length >= limit) break;
      out.push(value);
      this.pending.delete(key);
    }
    return out;
  }

  clear(): void {
    this.pending.clear();
  }

  /** Reset the dropped/coalesced counters after they have been reported. */
  resetCounters(): void {
    this.droppedCount = 0;
    this.coalescedCount = 0;
  }
}
