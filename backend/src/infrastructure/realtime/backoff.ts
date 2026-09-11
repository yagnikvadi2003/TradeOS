export interface BackoffOptions {
  readonly initialMs: number;
  readonly maxMs: number;
  readonly factor?: number;
  /** 0..1 — fraction of the delay randomised ("full jitter" style, bounded). */
  readonly jitter?: number;
  readonly random?: () => number;
}

/**
 * Exponential backoff with decorrelated jitter and a hard cap. Every failed
 * attempt widens the window; a successful connection resets it. Jitter is
 * what prevents a fleet of instances from reconnecting in lock-step
 * (a reconnect storm) after a provider outage.
 */
export class Backoff {
  private attempt = 0;
  private readonly factor: number;
  private readonly jitter: number;
  private readonly random: () => number;

  constructor(private readonly options: BackoffOptions) {
    this.factor = options.factor ?? 2;
    this.jitter = Math.min(Math.max(options.jitter ?? 0.3, 0), 1);
    this.random = options.random ?? Math.random;
  }

  get attempts(): number {
    return this.attempt;
  }

  /** Delay for the next attempt and advance the counter. */
  next(): number {
    const base = Math.min(this.options.initialMs * this.factor ** this.attempt, this.options.maxMs);
    this.attempt += 1;
    const spread = base * this.jitter;
    const delay = base - spread / 2 + this.random() * spread;
    return Math.round(Math.min(Math.max(delay, 0), this.options.maxMs));
  }

  reset(): void {
    this.attempt = 0;
  }
}
