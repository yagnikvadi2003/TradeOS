/**
 * Connection state machine shared by the provider feed and (mirrored on the
 * frontend) the application stream. Transitions outside `ALLOWED` are bugs
 * and are rejected loudly rather than silently accepted.
 */
export type ConnectionState =
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'AUTHENTICATING'
  | 'CONNECTED'
  | 'DEGRADED'
  | 'RECONNECTING'
  | 'STOPPING';

const ALLOWED: Record<ConnectionState, readonly ConnectionState[]> = {
  DISCONNECTED: ['CONNECTING', 'STOPPING'],
  CONNECTING: ['AUTHENTICATING', 'CONNECTED', 'RECONNECTING', 'DISCONNECTED', 'STOPPING'],
  AUTHENTICATING: ['CONNECTED', 'RECONNECTING', 'DISCONNECTED', 'STOPPING'],
  CONNECTED: ['DEGRADED', 'RECONNECTING', 'DISCONNECTED', 'STOPPING'],
  DEGRADED: ['CONNECTED', 'RECONNECTING', 'DISCONNECTED', 'STOPPING'],
  RECONNECTING: ['CONNECTING', 'DISCONNECTED', 'STOPPING'],
  STOPPING: ['DISCONNECTED'],
};

export function canTransition(from: ConnectionState, to: ConnectionState): boolean {
  return from === to || ALLOWED[from].includes(to);
}

export class ConnectionStateMachine {
  private current: ConnectionState = 'DISCONNECTED';
  private readonly listeners = new Set<
    (state: ConnectionState, previous: ConnectionState) => void
  >();

  get state(): ConnectionState {
    return this.current;
  }

  is(...states: ConnectionState[]): boolean {
    return states.includes(this.current);
  }

  transition(to: ConnectionState): boolean {
    if (this.current === to) return false;
    if (!canTransition(this.current, to)) {
      throw new Error(`Illegal connection transition ${this.current} → ${to}`);
    }
    const previous = this.current;
    this.current = to;
    for (const listener of this.listeners) listener(to, previous);
    return true;
  }

  onChange(listener: (state: ConnectionState, previous: ConnectionState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
