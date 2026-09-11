import { type ConnectionState } from './connection-state';
import {
  type ClientMessage,
  type MarketUpdate,
  type ProviderConnectionState,
  type ServerMessage,
  serverMessageSchema,
  type StreamKey,
} from './market-stream.messages';

/** Minimal surface of the browser WebSocket the client relies on; tests inject a fake. */
export interface StreamSocket {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: { code: number; reason: string }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
}
export type StreamSocketFactory = (url: string) => StreamSocket;

export interface StreamInfo {
  readonly state: ConnectionState;
  readonly reconnectAttempt: number;
  readonly latencyMs: number | null;
  readonly provider: ProviderConnectionState | null;
  readonly stale: boolean;
}

/**
 * Port for realtime market data. Subscriptions are reference counted on
 * the client too: ten components watching NIFTY 50 produce one subscribe
 * frame, and the last one to leave produces one unsubscribe frame.
 */
export interface MarketStream {
  readonly kind: 'ws' | 'mock';
  readonly info: StreamInfo;
  /** Retain keys; returns a release function. Connects lazily on first retain. */
  subscribe(keys: readonly StreamKey[]): () => void;
  onUpdates(listener: (updates: readonly MarketUpdate[]) => void): () => void;
  onInfo(listener: (info: StreamInfo) => void): () => void;
  disconnect(): void;
}

export interface WsMarketStreamOptions {
  readonly url: string;
  readonly getToken: () => Promise<string>;
  readonly socketFactory?: StreamSocketFactory;
  readonly now?: () => number;
  readonly heartbeatIntervalMs?: number;
  readonly heartbeatTimeoutMs?: number;
  readonly backoff?: { initialMs: number; maxMs: number; jitter: number; random?: () => number };
  /** Close the socket when no keys are retained for this long. */
  readonly idleCloseMs?: number;
}

const OPEN = 1;

/**
 * Native WebSocket client for `/ws/market`.
 *
 * - Auth first: nothing is sent before the `auth` ack.
 * - Reconnects with exponential backoff + jitter, resubscribing every
 *   retained key; server snapshots for those keys arrive as `snapshot`.
 * - Heartbeat every 15 s measures latency; a missed reply forces a reconnect.
 * - Every inbound frame is Zod-validated; invalid frames are dropped.
 * - Never touches React: listeners receive raw batches, the store decides
 *   when to render.
 */
export class WsMarketStream implements MarketStream {
  readonly kind = 'ws' as const;
  private socket: StreamSocket | null = null;
  private authenticated = false;
  private generation = 0;
  private closedByUser = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatDeadline: ReturnType<typeof setTimeout> | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;
  private readonly refs = new Map<StreamKey, number>();
  private readonly serverKnows = new Set<StreamKey>();
  private readonly pendingSubscribe = new Set<StreamKey>();
  private readonly pendingUnsubscribe = new Set<StreamKey>();
  private flushQueued = false;
  private readonly updateListeners = new Set<(u: readonly MarketUpdate[]) => void>();
  private readonly infoListeners = new Set<(i: StreamInfo) => void>();
  private current: StreamInfo = {
    state: 'idle',
    reconnectAttempt: 0,
    latencyMs: null,
    provider: null,
    stale: false,
  };
  private readonly socketFactory: StreamSocketFactory;
  private readonly now: () => number;
  private readonly heartbeatIntervalMs: number;
  private readonly heartbeatTimeoutMs: number;
  private readonly backoff: Required<NonNullable<WsMarketStreamOptions['backoff']>>;
  private readonly idleCloseMs: number;

  constructor(private readonly options: WsMarketStreamOptions) {
    this.socketFactory =
      options.socketFactory ?? ((url) => new WebSocket(url) as unknown as StreamSocket);
    this.now = options.now ?? (() => Date.now());
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? 15_000;
    this.heartbeatTimeoutMs = options.heartbeatTimeoutMs ?? 10_000;
    this.backoff = {
      random: Math.random,
      ...(options.backoff ?? { initialMs: 1_000, maxMs: 30_000, jitter: 0.4 }),
    };
    this.idleCloseMs = options.idleCloseMs ?? 30_000;
  }

  get info(): StreamInfo {
    return this.current;
  }

  subscribe(keys: readonly StreamKey[]): () => void {
    const fresh: StreamKey[] = [];
    for (const key of keys) {
      const n = (this.refs.get(key) ?? 0) + 1;
      this.refs.set(key, n);
      if (n === 1) fresh.push(key);
    }
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
    for (const key of fresh) {
      if (!this.pendingUnsubscribe.delete(key)) this.pendingSubscribe.add(key);
    }
    this.queueFlush();
    if (!this.socket && !this.reconnectTimer) this.connect();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const gone: StreamKey[] = [];
      for (const key of keys) {
        const n = (this.refs.get(key) ?? 1) - 1;
        if (n <= 0) {
          this.refs.delete(key);
          gone.push(key);
        } else {
          this.refs.set(key, n);
        }
      }
      for (const key of gone) {
        if (!this.pendingSubscribe.delete(key)) this.pendingUnsubscribe.add(key);
      }
      if (gone.length) this.queueFlush();
      if (this.refs.size === 0) this.scheduleIdleClose();
    };
  }

  onUpdates(listener: (updates: readonly MarketUpdate[]) => void): () => void {
    this.updateListeners.add(listener);
    return () => this.updateListeners.delete(listener);
  }

  onInfo(listener: (info: StreamInfo) => void): () => void {
    this.infoListeners.add(listener);
    return () => this.infoListeners.delete(listener);
  }

  disconnect(): void {
    this.closedByUser = true;
    this.teardown();
    this.setInfo({ state: 'disconnected' });
  }

  /* ------------------------------------------------------------------ */

  private connect(): void {
    this.closedByUser = false;
    const generation = ++this.generation;
    this.setInfo({
      state: this.attempt === 0 ? 'connecting' : 'reconnecting',
      reconnectAttempt: this.attempt,
    });
    let socket: StreamSocket;
    try {
      socket = this.socketFactory(this.options.url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;
    this.authenticated = false;
    socket.onopen = () => {
      if (generation !== this.generation) return;
      void this.options.getToken().then(
        (token) => {
          if (generation !== this.generation || socket.readyState !== OPEN) return;
          socket.send(JSON.stringify({ type: 'auth', token } satisfies ClientMessage));
        },
        () => socket.close(4000, 'token unavailable'),
      );
    };
    socket.onmessage = (event) => {
      if (generation !== this.generation) return;
      this.onFrame(event.data);
    };
    socket.onclose = (event) => {
      if (generation !== this.generation) return;
      this.socket = null;
      this.authenticated = false;
      this.serverKnows.clear();
      this.stopHeartbeat();
      if (this.closedByUser) return;
      // Fatal application closes (auth) still retry, but only after the full backoff window.
      if (event.code === 4003) this.attempt = Math.max(this.attempt, 5);
      this.scheduleReconnect();
    };
    socket.onerror = () => {
      /* the close event carries the outcome */
    };
  }

  private onFrame(raw: unknown): void {
    if (typeof raw !== 'string') return;
    let parsed: ReturnType<typeof serverMessageSchema.safeParse>;
    try {
      parsed = serverMessageSchema.safeParse(JSON.parse(raw));
    } catch {
      return;
    }
    if (!parsed.success) return;
    const message: ServerMessage = parsed.data;
    switch (message.type) {
      case 'auth':
        this.authenticated = true;
        this.attempt = 0;
        this.setInfo({ state: this.current.stale ? 'degraded' : 'connected', reconnectAttempt: 0 });
        this.resubscribeAll();
        this.startHeartbeat();
        return;
      case 'subscribe':
        for (const key of message.instruments) this.serverKnows.add(key);
        return;
      case 'unsubscribe':
        return;
      case 'snapshot':
      case 'delta':
        if (message.updates.length)
          for (const l of this.updateListeners) l(message.updates as MarketUpdate[]);
        return;
      case 'heartbeat': {
        if (this.heartbeatDeadline) clearTimeout(this.heartbeatDeadline);
        this.heartbeatDeadline = null;
        const latencyMs =
          message.sentAt !== undefined ? Math.max(0, this.now() - message.sentAt) : null;
        this.setInfo({ latencyMs });
        return;
      }
      case 'connection_status': {
        const stale =
          message.stale || message.provider === 'DEGRADED' || message.provider === 'RECONNECTING';
        this.setInfo({
          provider: message.provider,
          stale,
          state: this.authenticated ? (stale ? 'degraded' : 'connected') : this.current.state,
        });
        return;
      }
      case 'error':
        return;
    }
  }

  /** Flush pending subscription deltas once per microtask; no-ops until authenticated. */
  private queueFlush(): void {
    if (this.flushQueued) return;
    this.flushQueued = true;
    queueMicrotask(() => {
      this.flushQueued = false;
      this.flushPending();
    });
  }

  private flushPending(): void {
    if (!this.authenticated) return;
    if (this.pendingUnsubscribe.size) {
      const keys = [...this.pendingUnsubscribe];
      this.pendingUnsubscribe.clear();
      for (const key of keys) this.serverKnows.delete(key);
      this.send({ type: 'unsubscribe', instruments: keys });
    }
    if (this.pendingSubscribe.size) {
      const keys = [...this.pendingSubscribe].filter((k) => !this.serverKnows.has(k));
      this.pendingSubscribe.clear();
      if (keys.length) this.send({ type: 'subscribe', instruments: keys });
    }
  }

  private resubscribeAll(): void {
    this.pendingUnsubscribe.clear();
    this.pendingSubscribe.clear();
    const keys = [...this.refs.keys()].filter((k) => !this.serverKnows.has(k));
    if (keys.length) this.send({ type: 'subscribe', instruments: keys });
  }

  private send(message: ClientMessage): void {
    const socket = this.socket;
    if (socket?.readyState !== OPEN || !this.authenticated) return;
    socket.send(JSON.stringify(message));
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.closedByUser) return;
    if (this.refs.size === 0) {
      this.setInfo({ state: 'disconnected' });
      return;
    }
    const base = Math.min(this.backoff.initialMs * 2 ** this.attempt, this.backoff.maxMs);
    const spread = base * this.backoff.jitter;
    const delay = Math.round(base - spread / 2 + this.backoff.random() * spread);
    this.attempt += 1;
    this.setInfo({ state: 'reconnecting', reconnectAttempt: this.attempt });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.send({ type: 'heartbeat', sentAt: this.now() });
      this.heartbeatDeadline ??= setTimeout(() => {
        this.heartbeatDeadline = null;
        this.socket?.close(4014, 'heartbeat timeout');
      }, this.heartbeatTimeoutMs);
    }, this.heartbeatIntervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.heartbeatDeadline) clearTimeout(this.heartbeatDeadline);
    this.heartbeatTimer = null;
    this.heartbeatDeadline = null;
  }

  private scheduleIdleClose(): void {
    if (this.idleTimer) return;
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      if (this.refs.size === 0) {
        this.teardown();
        this.setInfo({ state: 'idle', reconnectAttempt: 0 });
      }
    }, this.idleCloseMs);
  }

  private teardown(): void {
    this.generation += 1;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.stopHeartbeat();
    const socket = this.socket;
    this.socket = null;
    this.authenticated = false;
    this.serverKnows.clear();
    this.attempt = 0;
    if (socket && socket.readyState <= OPEN) socket.close(1000, 'client closing');
  }

  private setInfo(patch: Partial<StreamInfo>): void {
    const next = { ...this.current, ...patch };
    if (
      next.state === this.current.state &&
      next.reconnectAttempt === this.current.reconnectAttempt &&
      next.latencyMs === this.current.latencyMs &&
      next.provider === this.current.provider &&
      next.stale === this.current.stale
    ) {
      return;
    }
    this.current = next;
    for (const l of this.infoListeners) l(next);
  }
}
