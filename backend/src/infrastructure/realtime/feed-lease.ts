/**
 * Decides which instance owns the single upstream provider connection.
 * In-process: always this one. Redis: a `SET NX PX` lease renewed on a
 * timer; losing the lease stops the feed on this instance and another
 * instance picks it up within one lease period.
 */
export interface FeedLease {
  readonly kind: 'memory' | 'redis';
  readonly instanceId: string;
  /** Resolves true when this instance holds the lease. */
  acquire(): Promise<boolean>;
  release(): Promise<void>;
  onChange(listener: (isLeader: boolean) => void): () => void;
}

export const FEED_LEASE = Symbol('FEED_LEASE');

export class InProcessFeedLease implements FeedLease {
  readonly kind = 'memory' as const;
  constructor(readonly instanceId: string) {}
  acquire(): Promise<boolean> {
    return Promise.resolve(true);
  }
  release(): Promise<void> {
    return Promise.resolve();
  }
  onChange(): () => void {
    return noop;
  }
}

function noop(): void {
  /* single instance: leadership never changes */
}
