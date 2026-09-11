import { type ConnectionState } from '@/infrastructure/realtime/connection-state';
import {
  type MarketStatusUpdate,
  type MarketUpdate,
  type StreamKey,
} from '@/modules/market-stream/domain/market-update';
import { type MarketDataSource } from '@/modules/option-chain/domain';
import { type MarketDataProviderName } from './provider.interface';

export interface FeedStateChange {
  readonly state: ConnectionState;
  readonly previous: ConnectionState;
  readonly reason?: string;
  readonly at: number;
}

/**
 * Streaming counterpart of `MarketDataProvider`. One instance owns at most
 * one upstream connection; the gateway never talks to this directly — the
 * `MarketStreamService` drives it from the subscription registry.
 *
 * Keys are TradeOS stream keys. Mapping to provider symbols, protobuf
 * decoding, batching of subscribe requests and reconnection are all inside
 * the adapter.
 */
export interface MarketFeedProvider {
  readonly name: MarketDataProviderName;
  readonly dataSource: MarketDataSource;
  readonly state: ConnectionState;
  start(): Promise<void>;
  stop(): Promise<void>;
  /** Idempotent; the adapter dedupes and batches upstream requests. */
  subscribe(keys: readonly StreamKey[]): void;
  unsubscribe(keys: readonly StreamKey[]): void;
  onUpdates(listener: (updates: readonly MarketUpdate[]) => void): () => void;
  onStateChange(listener: (change: FeedStateChange) => void): () => void;
  onMarketStatus(listener: (status: MarketStatusUpdate) => void): () => void;
}

export const MARKET_FEED_PROVIDER = Symbol('MARKET_FEED_PROVIDER');
