import { randomUUID } from 'node:crypto';
import { type IncomingMessage, type Server as HttpServer } from 'node:http';
import { type Duplex } from 'node:stream';
import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { WebSocket, WebSocketServer } from 'ws';
import { APP_ENV, type AppEnv } from '@/common/config/env';
import {
  type ClientMessage,
  clientMessageSchema,
  type ServerMessage,
  WS_CLOSE,
  WS_PROTOCOL_VERSION,
  type WsErrorCode,
} from '@/common/realtime/ws-messages';
import {
  type RealtimeClaims,
  REALTIME_TOKEN_SERVICE,
  type RealtimeTokenService,
} from '@/common/realtime/realtime-auth';
import { RealtimeMetrics } from '@/infrastructure/realtime/realtime-metrics';
import { MarketDataRouter, type RouterClient } from './market-data.router';
import { MarketStreamService } from './market-stream.service';

export const WS_PATH = '/ws/market';
const AUTH_TIMEOUT_MS = 10_000;
const HEARTBEAT_INTERVAL_MS = 15_000;
const MISSED_HEARTBEATS_LIMIT = 2;

interface ClientSession {
  readonly id: string;
  readonly ip: string;
  readonly socket: WebSocket;
  claims: RealtimeClaims | null;
  authTimer: NodeJS.Timeout | null;
  missedHeartbeats: number;
  /** Token bucket for inbound messages. */
  tokens: number;
  lastRefill: number;
}

/**
 * `/ws/market`. Order of operations for every connection:
 *   upgrade → origin + connection-limit checks → socket → `auth` within 10 s
 *   → subscribe/unsubscribe (validated, authorized, capped) → snapshot then deltas.
 * Inbound frames are size-capped by `ws` (`maxPayload`) and rate-limited per
 * client; outbound deltas flow through the router's coalescing queues.
 * Server pings every 15 s; two misses close the socket.
 */
@Injectable()
export class MarketStreamGateway implements OnModuleDestroy {
  private server: WebSocketServer | null = null;
  private readonly sessions = new Map<string, ClientSession>();
  private readonly perIp = new Map<string, number>();
  private readonly router: MarketDataRouter;
  private readonly allowedOrigins: Set<string>;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private readonly disposers: (() => void)[] = [];
  private upgradeHandler: ((req: IncomingMessage, socket: Duplex, head: Buffer) => void) | null =
    null;
  private httpServer: HttpServer | null = null;

  constructor(
    private readonly stream: MarketStreamService,
    private readonly metrics: RealtimeMetrics,
    private readonly logger: Logger,
    @Inject(APP_ENV) private readonly env: AppEnv,
    @Inject(REALTIME_TOKEN_SERVICE) private readonly tokens: RealtimeTokenService,
    private readonly adapterHost: HttpAdapterHost,
  ) {
    this.router = new MarketDataRouter(stream.registry, metrics, {
      flushIntervalMs: env.WS_FLUSH_INTERVAL_MS,
      maxPendingKeys: env.WS_MAX_SUBSCRIPTIONS_PER_CLIENT * 2,
    });
    this.allowedOrigins = new Set(
      env.CORS_ORIGINS.split(',')
        .map((o) => o.trim())
        .filter(Boolean),
    );
  }

  /** Attach to the HTTP server. Idempotent; the module calls it on bootstrap. */
  attach(
    httpServer: HttpServer = this.adapterHost.httpAdapter.getHttpServer() as HttpServer,
  ): void {
    if (this.server) return;
    this.httpServer = httpServer;
    this.server = new WebSocketServer({
      noServer: true,
      maxPayload: this.env.WS_MAX_MESSAGE_BYTES,
    });
    this.upgradeHandler = (req, socket, head) => this.onUpgrade(req, socket, head);
    httpServer.on('upgrade', this.upgradeHandler);
    this.disposers.push(
      this.stream.onUpdates((updates) => this.router.route(updates)),
      this.stream.onStatus((status) => this.broadcast({ type: 'connection_status', ...status })),
    );
    this.heartbeatTimer = setInterval(() => this.heartbeat(), HEARTBEAT_INTERVAL_MS);
    this.metrics.set('wsAttached', true);
    this.logger.log(`Market stream WebSocket attached at ${WS_PATH}`);
  }

  async onModuleDestroy(): Promise<void> {
    this.metrics.set('wsAttached', false);
    for (const dispose of this.disposers) dispose();
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    for (const session of this.sessions.values())
      session.socket.close(WS_CLOSE.SHUTDOWN, 'server shutdown');
    this.router.dispose();
    if (this.httpServer && this.upgradeHandler) this.httpServer.off('upgrade', this.upgradeHandler);
    await new Promise<void>((resolve) =>
      this.server ? this.server.close(() => resolve()) : resolve(),
    );
    this.server = null;
  }

  get connectionCount(): number {
    return this.sessions.size;
  }

  /* ------------------------------------------------------------------ */
  /* Connection admission                                                */
  /* ------------------------------------------------------------------ */

  private onUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname !== WS_PATH) {
      socket.destroy();
      return;
    }
    const origin = req.headers.origin;
    // Browsers always send Origin on WebSocket upgrades; non-browser clients (tests, tools) may omit it.
    if (origin && !this.allowedOrigins.has(origin)) {
      this.metrics.inc('rejectedOrigins');
      rejectUpgrade(socket, 403);
      return;
    }
    const ip = clientIp(req);
    if (this.sessions.size >= this.env.WS_MAX_CONNECTIONS) {
      this.metrics.inc('rejectedConnections');
      rejectUpgrade(socket, 503);
      return;
    }
    if ((this.perIp.get(ip) ?? 0) >= this.env.WS_MAX_CONNECTIONS_PER_IP) {
      this.metrics.inc('rejectedConnections');
      rejectUpgrade(socket, 429);
      return;
    }
    this.server!.handleUpgrade(req, socket, head, (ws) => this.onConnection(ws, ip));
  }

  private onConnection(ws: WebSocket, ip: string): void {
    const session: ClientSession = {
      id: randomUUID(),
      ip,
      socket: ws,
      claims: null,
      authTimer: null,
      missedHeartbeats: 0,
      tokens: this.env.WS_MESSAGES_PER_SECOND,
      lastRefill: Date.now(),
    };
    this.sessions.set(session.id, session);
    this.perIp.set(ip, (this.perIp.get(ip) ?? 0) + 1);
    this.metrics.set('activeClients', this.sessions.size);
    session.authTimer = setTimeout(() => {
      if (!session.claims) {
        this.sendError(session, 'UNAUTHENTICATED', 'authenticate within 10 s', true);
        ws.close(WS_CLOSE.AUTH_TIMEOUT, 'auth timeout');
      }
    }, AUTH_TIMEOUT_MS);

    ws.on('message', (data, isBinary) => this.onMessage(session, data as Buffer, isBinary));
    ws.on('pong', () => {
      session.missedHeartbeats = 0;
    });
    ws.on('close', () => this.onClose(session));
    ws.on('error', (error) =>
      this.logger.debug({ err: error.message, client: session.id }, 'ws error'),
    );
  }

  private onClose(session: ClientSession): void {
    if (session.authTimer) clearTimeout(session.authTimer);
    this.sessions.delete(session.id);
    const n = (this.perIp.get(session.ip) ?? 1) - 1;
    if (n <= 0) this.perIp.delete(session.ip);
    else this.perIp.set(session.ip, n);
    this.router.detach(session.id);
    this.stream.removeClient(session.id);
    this.metrics.set('activeClients', this.sessions.size);
  }

  /* ------------------------------------------------------------------ */
  /* Inbound                                                             */
  /* ------------------------------------------------------------------ */

  private onMessage(session: ClientSession, data: Buffer, isBinary: boolean): void {
    if (!this.takeToken(session)) {
      this.metrics.inc('rateLimited');
      this.sendError(session, 'RATE_LIMITED', 'too many messages', true);
      session.socket.close(WS_CLOSE.RATE_LIMITED, 'rate limited');
      return;
    }
    if (isBinary) {
      this.sendError(session, 'INVALID_MESSAGE', 'text frames only');
      return;
    }
    let parsed: ReturnType<typeof clientMessageSchema.safeParse>;
    try {
      parsed = clientMessageSchema.safeParse(JSON.parse(data.toString('utf8')));
    } catch {
      this.sendError(session, 'INVALID_MESSAGE', 'malformed JSON');
      return;
    }
    if (!parsed.success) {
      this.sendError(
        session,
        'INVALID_MESSAGE',
        parsed.error.issues[0]?.message ?? 'invalid message',
      );
      return;
    }
    const message = parsed.data;
    if (message.type === 'auth') {
      this.authenticate(session, message.token);
      return;
    }
    if (!session.claims) {
      this.sendError(session, 'UNAUTHENTICATED', 'send auth first');
      return;
    }
    this.dispatch(session, message);
  }

  private authenticate(session: ClientSession, token: string): void {
    const claims = this.tokens.verify(token);
    if (!claims) {
      this.metrics.inc('authFailures');
      this.sendError(session, 'AUTH_FAILED', 'invalid or expired token', true);
      session.socket.close(WS_CLOSE.AUTH_FAILED, 'auth failed');
      return;
    }
    session.claims = claims;
    if (session.authTimer) clearTimeout(session.authTimer);
    session.authTimer = null;
    this.router.attach(this.routerClient(session));
    this.send(session, {
      type: 'auth',
      ok: true,
      sessionId: session.id,
      expiresAt: claims.exp * 1000,
      protocol: WS_PROTOCOL_VERSION,
    });
    this.send(session, { type: 'connection_status', ...this.stream.status });
  }

  private dispatch(session: ClientSession, message: ClientMessage): void {
    const claims = session.claims!;
    switch (message.type) {
      case 'subscribe': {
        const current = this.stream.registry.subscriptionsOf(session.id)?.size ?? 0;
        const fresh = message.instruments.filter(
          (k) => !this.stream.registry.subscriptionsOf(session.id)?.has(k),
        );
        if (current + fresh.length > this.env.WS_MAX_SUBSCRIPTIONS_PER_CLIENT) {
          this.sendError(
            session,
            'SUBSCRIPTION_LIMIT',
            `at most ${this.env.WS_MAX_SUBSCRIPTIONS_PER_CLIENT} instruments per client`,
          );
          return;
        }
        const result = this.stream.subscribe(session.id, message.instruments, claims.scope);
        if (result.rejected.length)
          this.metrics.inc('unauthorizedSubscriptions', result.rejected.length);
        this.send(session, {
          type: 'subscribe',
          ok: true,
          instruments: result.accepted,
          rejected: result.rejected,
        });
        if (result.snapshot.length)
          this.send(session, { type: 'snapshot', updates: result.snapshot });
        return;
      }
      case 'unsubscribe': {
        const removed = this.stream.unsubscribe(session.id, message.instruments);
        this.send(session, { type: 'unsubscribe', ok: true, instruments: removed });
        return;
      }
      case 'heartbeat': {
        session.missedHeartbeats = 0;
        const now = Date.now();
        if (message.sentAt !== undefined && message.sentAt <= now)
          this.metrics.observeLatency(now - message.sentAt);
        this.send(session, {
          type: 'heartbeat',
          serverTime: now,
          ...(message.sentAt !== undefined ? { sentAt: message.sentAt } : {}),
        });
        return;
      }
      case 'auth':
        return;
    }
  }

  private takeToken(session: ClientSession): boolean {
    const now = Date.now();
    const elapsed = (now - session.lastRefill) / 1000;
    if (elapsed > 0) {
      session.tokens = Math.min(
        this.env.WS_MESSAGES_PER_SECOND,
        session.tokens + elapsed * this.env.WS_MESSAGES_PER_SECOND,
      );
      session.lastRefill = now;
    }
    if (session.tokens < 1) return false;
    session.tokens -= 1;
    return true;
  }

  /* ------------------------------------------------------------------ */
  /* Outbound                                                            */
  /* ------------------------------------------------------------------ */

  private routerClient(session: ClientSession): RouterClient {
    return {
      id: session.id,
      bufferedBytes: () => session.socket.bufferedAmount,
      send: (message) => this.send(session, message),
      sendRaw: (frame) => {
        if (session.socket.readyState === WebSocket.OPEN) session.socket.send(frame);
      },
    };
  }

  private send(session: ClientSession, message: ServerMessage): void {
    if (session.socket.readyState !== WebSocket.OPEN) return;
    session.socket.send(JSON.stringify(message));
  }

  private sendError(
    session: ClientSession,
    code: WsErrorCode,
    message: string,
    fatal = false,
  ): void {
    this.send(
      session,
      fatal ? { type: 'error', code, message, fatal } : { type: 'error', code, message },
    );
  }

  private broadcast(message: ServerMessage): void {
    const payload = JSON.stringify(message);
    for (const session of this.sessions.values()) {
      if (session.claims && session.socket.readyState === WebSocket.OPEN)
        session.socket.send(payload);
    }
  }

  private heartbeat(): void {
    for (const session of this.sessions.values()) {
      if (session.socket.readyState !== WebSocket.OPEN) continue;
      if (session.missedHeartbeats >= MISSED_HEARTBEATS_LIMIT) {
        session.socket.close(WS_CLOSE.HEARTBEAT_TIMEOUT, 'heartbeat timeout');
        continue;
      }
      session.missedHeartbeats += 1;
      session.socket.ping();
    }
  }
}

function clientIp(req: IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for'];
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0];
  const trimmed = first?.trim();
  if (trimmed) return trimmed;
  return req.socket.remoteAddress ?? 'unknown';
}

function rejectUpgrade(socket: Duplex, status: number): void {
  const text =
    status === 403 ? 'Forbidden' : status === 429 ? 'Too Many Requests' : 'Service Unavailable';
  socket.write(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
}
