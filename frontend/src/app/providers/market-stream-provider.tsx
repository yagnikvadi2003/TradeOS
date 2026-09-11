import { type ReactNode, useEffect, useMemo } from 'react';
import { env } from '@/app/config/env';
import {
  type MarketStream,
  type StreamSocket,
  WsMarketStream,
} from '@/services/websocket/market-stream';
import { MockMarketStream } from '@/services/websocket/mock-market-stream';
import { useConnectionStore } from '@/stores/connection.store';
import { useMarketStateStore } from '@/stores/market-state.store';
import { MarketStreamContext } from './market-stream-context';
import { useMarketDataClient } from './use-market-data-client';

interface MarketStreamProviderProps {
  children: ReactNode;
  /** Override for tests. */
  stream?: MarketStream;
}

/** Build-time E2E seam: tracks live sockets so a test can simulate a network drop. */
function e2eSocketFactory(url: string): StreamSocket {
  const socket = new WebSocket(url);
  const w = window as unknown as { __tradeosSockets?: WebSocket[] };
  w.__tradeosSockets = [...(w.__tradeosSockets ?? []).filter((s) => s.readyState <= 1), socket];
  return socket as unknown as StreamSocket;
}

/**
 * A session token is reused across reconnects until shortly before it
 * expires, so a flapping network never turns into a burst of token requests.
 */
function cachedTokenSource(
  fetchToken: () => Promise<{ token: string; expiresAt: number }>,
): () => Promise<string> {
  let cached: { token: string; expiresAt: number } | null = null;
  return async () => {
    if (cached && cached.expiresAt - Date.now() > 60_000) return cached.token;
    cached = await fetchToken();
    return cached.token;
  };
}

function resolveWsUrl(path: string): string {
  if (/^wss?:\/\//.test(path)) return path;
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}${path}`;
}

/**
 * Owns the single market stream for the app and wires it to the two stores:
 * batches → market-state store (data), info → connection store (status).
 * The stream connects lazily on the first subscription and idles out when
 * nothing is retained, so a user reading a static page costs no socket.
 */
export function MarketStreamProvider({ children, stream: injected }: MarketStreamProviderProps) {
  const client = useMarketDataClient();
  const stream = useMemo<MarketStream>(() => {
    if (injected) return injected;
    if (client.kind === 'mock') return new MockMarketStream();
    return new WsMarketStream({
      url: resolveWsUrl(env.VITE_WS_URL),
      ...(env.VITE_E2E_HOOKS ? { socketFactory: e2eSocketFactory } : {}),
      getToken: cachedTokenSource(() => client.getRealtimeToken()),
    });
  }, [client, injected]);

  useEffect(() => {
    const applyBatch = useMarketStateStore.getState().applyBatch;
    const connection = useConnectionStore.getState();
    const offUpdates = stream.onUpdates((batch) => {
      applyBatch(batch);
      connection.recordMessage(Date.now());
    });
    const offInfo = stream.onInfo((info) => {
      connection.setState(info.state);
      connection.setReconnectAttempt(info.reconnectAttempt);
      if (info.latencyMs !== null) connection.recordLatency(info.latencyMs);
      if (info.provider) connection.setProvider(info.provider, info.stale);
    });
    connection.setState(stream.info.state);
    return () => {
      offUpdates();
      offInfo();
      stream.disconnect();
    };
  }, [stream]);

  return <MarketStreamContext.Provider value={stream}>{children}</MarketStreamContext.Provider>;
}
