import { type Candle, type CandleInterval, type CandleSeries } from '@/features/charts/domain';
import { type IndexQuote, type InstrumentKey } from '@/features/market/domain';
import {
  type Expiry,
  type IsoDate,
  type OptionChainMetadata,
  type OptionChainSnapshot,
} from '@/features/option-chain/domain';

/**
 * Frontend-facing market data port. Implementations: HTTP (backend REST) and
 * Mock (deterministic simulation for development/tests). The UI depends on
 * this interface only — never on a provider SDK.
 */
export interface RealtimeToken {
  readonly token: string;
  readonly expiresAt: number;
}

import {
  type Alert,
  type AppNotification,
  type CreateAlertInput,
  type Preferences,
  type Watchlist,
} from './user-data.schemas';

/** Session-owned user data (watchlists, alerts, notifications, preferences). */
export interface UserDataClient {
  ensureSession(signal?: AbortSignal): Promise<{ id: string; expiresAt: number }>;
  listWatchlists(signal?: AbortSignal): Promise<Watchlist[]>;
  createWatchlist(name: string): Promise<Watchlist>;
  renameWatchlist(id: string, name: string): Promise<Watchlist>;
  deleteWatchlist(id: string): Promise<void>;
  addWatchlistItem(id: string, instrumentKey: string): Promise<Watchlist>;
  removeWatchlistItem(id: string, instrumentKey: string): Promise<Watchlist>;
  reorderWatchlistItems(id: string, instrumentKeys: readonly string[]): Promise<Watchlist>;
  listAlerts(signal?: AbortSignal): Promise<Alert[]>;
  createAlert(input: CreateAlertInput): Promise<Alert>;
  updateAlert(
    id: string,
    patch: Partial<Pick<Alert, 'threshold' | 'repeat' | 'note'>> & {
      status?: 'ACTIVE' | 'DISABLED';
    },
  ): Promise<Alert>;
  deleteAlert(id: string): Promise<void>;
  listNotifications(limit?: number, signal?: AbortSignal): Promise<AppNotification[]>;
  markNotificationsRead(ids: readonly string[] | 'all'): Promise<number>;
  getPreferences(signal?: AbortSignal): Promise<Preferences>;
  setPreferences(patch: Preferences): Promise<Preferences>;
}

export interface MarketDataClient extends UserDataClient {
  readonly kind: 'http' | 'mock';
  getIndexQuotes(keys: readonly InstrumentKey[], signal?: AbortSignal): Promise<IndexQuote[]>;
  /** Short-lived session token for the market WebSocket. */
  getRealtimeToken(signal?: AbortSignal): Promise<RealtimeToken>;
  getCandles(
    key: InstrumentKey,
    interval: CandleInterval,
    signal?: AbortSignal,
  ): Promise<CandleSeries>;
  getOptionChainMetadata(key: InstrumentKey, signal?: AbortSignal): Promise<OptionChainMetadata>;
  getOptionChainExpiries(key: InstrumentKey, signal?: AbortSignal): Promise<Expiry[]>;
  /** Full chain snapshot for one expiry (nearest listed when omitted). Never polled. */
  getOptionChainSnapshot(
    key: InstrumentKey,
    expiry: IsoDate | null,
    signal?: AbortSignal,
  ): Promise<OptionChainSnapshot>;
}

export type { Candle, CandleInterval, CandleSeries, IndexQuote, InstrumentKey };
