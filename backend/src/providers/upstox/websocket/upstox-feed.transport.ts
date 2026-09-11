import WebSocket from 'ws';
import { ProviderUnavailableError } from '@/common/errors/domain-error';

/**
 * Thin socket transport so the connection manager can be tested with a
 * fake. Responsibilities: fetch the authorized wss URL, open the socket,
 * surface binary frames, send binary requests, close.
 */
export interface FeedSocket {
  send(data: Buffer): void;
  close(code?: number, reason?: string): void;
  readonly isOpen: boolean;
}

export interface FeedTransportEvents {
  onOpen: () => void;
  onMessage: (bytes: Uint8Array) => void;
  onPing: () => void;
  onClose: (code: number, reason: string) => void;
  onError: (error: Error) => void;
}

export interface FeedTransport {
  /** Resolves with an open socket, or rejects (auth failure, timeout, network). */
  connect(events: FeedTransportEvents, timeoutMs: number): Promise<FeedSocket>;
}

export interface UpstoxAuthorizeResponse {
  status?: string;
  data?: { authorizedRedirectUri?: string; authorized_redirect_uri?: string };
}

export class UpstoxAuthError extends Error {
  constructor(readonly status: number) {
    super(`Upstox feed authorization failed (HTTP ${status})`);
    this.name = 'UpstoxAuthError';
  }
}

/**
 * Real transport. Verified flow: `GET {api}/v3/feed/market-data-feed/authorize`
 * with `Authorization: Bearer <token>` → `data.authorizedRedirectUri`
 * (`wss://…/market-data-feeder/v3/…`), then a plain WebSocket to that URL.
 * Upstox sends standard ping frames; `ws` replies with pong automatically.
 */
export class UpstoxFeedTransport implements FeedTransport {
  constructor(
    private readonly apiBaseUrl: string,
    private readonly accessToken: () => Promise<string | undefined> | string | undefined,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async authorize(): Promise<string> {
    const token = await this.accessToken();
    if (!token) throw new UpstoxAuthError(401);
    const response = await this.fetchImpl(`${this.apiBaseUrl}/v3/feed/market-data-feed/authorize`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    });
    if (response.status === 401 || response.status === 403)
      throw new UpstoxAuthError(response.status);
    if (!response.ok) {
      throw new ProviderUnavailableError('upstox', new Error(`authorize HTTP ${response.status}`));
    }
    const body = (await response.json()) as UpstoxAuthorizeResponse;
    const uri = body.data?.authorizedRedirectUri ?? body.data?.authorized_redirect_uri;
    if (!uri?.startsWith('wss://')) {
      throw new ProviderUnavailableError('upstox', new Error('authorize response missing wss URI'));
    }
    return uri;
  }

  async connect(events: FeedTransportEvents, timeoutMs: number): Promise<FeedSocket> {
    const url = await this.authorize();
    return new Promise<FeedSocket>((resolve, reject) => {
      const ws = new WebSocket(url, { followRedirects: true, handshakeTimeout: timeoutMs });
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        ws.terminate();
        reject(new ProviderUnavailableError('upstox', new Error('feed connect timeout')));
      }, timeoutMs);
      const socket: FeedSocket = {
        send: (data) => ws.send(data, { binary: true }),
        close: (code, reason) => ws.close(code, reason),
        get isOpen() {
          return ws.readyState === WebSocket.OPEN;
        },
      };
      ws.on('open', () => {
        clearTimeout(timer);
        if (!settled) {
          settled = true;
          resolve(socket);
        }
        events.onOpen();
      });
      ws.on('message', (data: WebSocket.RawData) => {
        const bytes = Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as ArrayBuffer);
        events.onMessage(new Uint8Array(bytes));
      });
      ws.on('ping', () => events.onPing());
      ws.on('close', (code, reason) => {
        clearTimeout(timer);
        events.onClose(code, reason.toString());
        if (!settled) {
          settled = true;
          reject(
            new ProviderUnavailableError('upstox', new Error(`closed during connect (${code})`)),
          );
        }
      });
      ws.on('error', (error: Error) => {
        clearTimeout(timer);
        events.onError(error);
        if (!settled) {
          settled = true;
          reject(new ProviderUnavailableError('upstox', error));
        }
      });
    });
  }
}
