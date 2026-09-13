import type { CandleInterval, CandleSeries } from '@/features/charts/domain';
import type { IndexQuote, InstrumentKey } from '@/features/market/domain';
import type {
  Expiry,
  IsoDate,
  OptionChainMetadata,
  OptionChainSnapshot,
} from '@/features/option-chain/domain';
import type { HttpClient } from './http-client';
import type { MarketDataClient, RealtimeToken } from './market-data.client';
import type { UserDataClient } from './market-data.client';
import { HttpUserDataClient } from './http-user-data.client';
import {
  expiriesResponseSchema,
  metadataResponseSchema,
  type OptionChainMetadataDto,
  type OptionChainSnapshotDto,
  snapshotResponseSchema,
} from './option-chain.schemas';
import {
  candlesResponseSchema,
  indexQuotesResponseSchema,
  realtimeTokenResponseSchema,
} from './schemas';

/**
 * Backend REST adapter (phase 2+ endpoints). Quote snapshots and historical
 * candles are REST; realtime updates will arrive over the application
 * WebSocket, never via polling.
 */
export class HttpMarketDataClient implements MarketDataClient {
  readonly kind = 'http' as const;
  private readonly userData: HttpUserDataClient;

  constructor(private readonly http: HttpClient) {
    this.userData = new HttpUserDataClient(http);
  }

  // Session-owned user data: delegated to the REST user-data client.
  ensureSession: UserDataClient['ensureSession'] = (s) => this.userData.ensureSession(s);
  listWatchlists: UserDataClient['listWatchlists'] = (s) => this.userData.listWatchlists(s);
  createWatchlist: UserDataClient['createWatchlist'] = (n) => this.userData.createWatchlist(n);
  renameWatchlist: UserDataClient['renameWatchlist'] = (i, n) =>
    this.userData.renameWatchlist(i, n);
  deleteWatchlist: UserDataClient['deleteWatchlist'] = (i) => this.userData.deleteWatchlist(i);
  addWatchlistItem: UserDataClient['addWatchlistItem'] = (i, k) =>
    this.userData.addWatchlistItem(i, k);
  removeWatchlistItem: UserDataClient['removeWatchlistItem'] = (i, k) =>
    this.userData.removeWatchlistItem(i, k);
  reorderWatchlistItems: UserDataClient['reorderWatchlistItems'] = (i, k) =>
    this.userData.reorderWatchlistItems(i, k);
  listAlerts: UserDataClient['listAlerts'] = (s) => this.userData.listAlerts(s);
  createAlert: UserDataClient['createAlert'] = (i) => this.userData.createAlert(i);
  updateAlert: UserDataClient['updateAlert'] = (i, p) => this.userData.updateAlert(i, p);
  deleteAlert: UserDataClient['deleteAlert'] = (i) => this.userData.deleteAlert(i);
  listNotifications: UserDataClient['listNotifications'] = (l, s) =>
    this.userData.listNotifications(l, s);
  markNotificationsRead: UserDataClient['markNotificationsRead'] = (i) =>
    this.userData.markNotificationsRead(i);
  getPreferences: UserDataClient['getPreferences'] = (s) => this.userData.getPreferences(s);
  setPreferences: UserDataClient['setPreferences'] = (p) => this.userData.setPreferences(p);

  async getRealtimeToken(signal?: AbortSignal): Promise<RealtimeToken> {
    const response = await this.http.get('/realtime/token', realtimeTokenResponseSchema, signal);
    return { token: response.data.token, expiresAt: response.data.expiresAt };
  }

  async getIndexQuotes(
    keys: readonly InstrumentKey[],
    signal?: AbortSignal,
  ): Promise<IndexQuote[]> {
    if (keys.length === 0) return [];
    const query = encodeURIComponent(keys.join(','));
    const response = await this.http.get(
      `/market/quotes?instrumentKeys=${query}`,
      indexQuotesResponseSchema,
      signal,
    );
    return response.data.map((dto) => ({
      ...dto,
      instrumentKey: dto.instrumentKey as InstrumentKey,
    }));
  }

  async getCandles(
    key: InstrumentKey,
    interval: CandleInterval,
    signal?: AbortSignal,
  ): Promise<CandleSeries> {
    const response = await this.http.get(
      `/charts/${encodeURIComponent(key)}/candles?interval=${interval}`,
      candlesResponseSchema,
      signal,
    );
    return {
      instrumentKey: response.data.instrumentKey as InstrumentKey,
      interval: response.data.interval,
      candles: response.data.candles.map((c) =>
        c.volume === undefined
          ? { time: c.time, open: c.open, high: c.high, low: c.low, close: c.close }
          : {
              time: c.time,
              open: c.open,
              high: c.high,
              low: c.low,
              close: c.close,
              volume: c.volume,
            },
      ),
    };
  }

  async getOptionChainMetadata(
    key: InstrumentKey,
    signal?: AbortSignal,
  ): Promise<OptionChainMetadata> {
    const response = await this.http.get(
      `/option-chain/${encodeURIComponent(key)}`,
      metadataResponseSchema,
      signal,
    );
    return metadataFromDto(response.data);
  }

  async getOptionChainExpiries(key: InstrumentKey, signal?: AbortSignal): Promise<Expiry[]> {
    const response = await this.http.get(
      `/option-chain/${encodeURIComponent(key)}/expiries`,
      expiriesResponseSchema,
      signal,
    );
    return response.data.map((e) => ({ ...e, instrumentKey: e.instrumentKey as InstrumentKey }));
  }

  async getOptionChainSnapshot(
    key: InstrumentKey,
    expiry: IsoDate | null,
    signal?: AbortSignal,
  ): Promise<OptionChainSnapshot> {
    const query = expiry ? `?expiry=${encodeURIComponent(expiry)}` : '';
    const response = await this.http.get(
      `/option-chain/${encodeURIComponent(key)}/snapshot${query}`,
      snapshotResponseSchema,
      signal,
    );
    return snapshotFromDto(response.data);
  }
}

/* DTO → domain. The shapes match after validation; the casts narrow the
   string keys to the branded frontend types. */
function metadataFromDto(dto: OptionChainMetadataDto): OptionChainMetadata {
  return {
    ...dto,
    instrumentKey: dto.instrumentKey as InstrumentKey,
    expiries: dto.expiries.map((e) => ({ ...e, instrumentKey: e.instrumentKey as InstrumentKey })),
  };
}

function snapshotFromDto(dto: OptionChainSnapshotDto): OptionChainSnapshot {
  const instrumentKey = dto.instrumentKey as InstrumentKey;
  return {
    ...dto,
    instrumentKey,
    expiry: { ...dto.expiry, instrumentKey },
    underlying: { ...dto.underlying, instrumentKey },
    strikes: dto.strikes.map((s) => ({
      ...s,
      ce: s.ce ? { ...s.ce, contract: { ...s.ce.contract, underlyingKey: instrumentKey } } : null,
      pe: s.pe ? { ...s.pe, contract: { ...s.pe.contract, underlyingKey: instrumentKey } } : null,
    })),
  };
}
