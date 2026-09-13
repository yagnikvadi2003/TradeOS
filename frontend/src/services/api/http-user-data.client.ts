import { type HttpClient } from './http-client';
import { type UserDataClient } from './market-data.client';
import {
  type Alert,
  alertResponseSchema,
  alertsResponseSchema,
  type AppNotification,
  type CreateAlertInput,
  deletedResponseSchema,
  markedResponseSchema,
  notificationsResponseSchema,
  type Preferences,
  preferencesResponseSchema,
  sessionResponseSchema,
  type Watchlist,
  watchlistResponseSchema,
  watchlistsResponseSchema,
} from './user-data.schemas';

const enc = encodeURIComponent;

/** REST implementation of the session-owned user-data port (cookie session, CSRF header on mutations). */
export class HttpUserDataClient implements UserDataClient {
  constructor(private readonly http: HttpClient) {}

  async ensureSession(signal?: AbortSignal) {
    const r = await this.http.get('/session', sessionResponseSchema, signal);
    return { id: r.data.id, expiresAt: r.data.expiresAt };
  }
  async listWatchlists(signal?: AbortSignal): Promise<Watchlist[]> {
    return (await this.http.get('/watchlists', watchlistsResponseSchema, signal)).data;
  }
  async createWatchlist(name: string): Promise<Watchlist> {
    return (await this.http.send('POST', '/watchlists', watchlistResponseSchema, { name })).data;
  }
  async renameWatchlist(id: string, name: string): Promise<Watchlist> {
    return (
      await this.http.send('PATCH', `/watchlists/${enc(id)}`, watchlistResponseSchema, { name })
    ).data;
  }
  async deleteWatchlist(id: string): Promise<void> {
    await this.http.send('DELETE', `/watchlists/${enc(id)}`, deletedResponseSchema);
  }
  async addWatchlistItem(id: string, instrumentKey: string): Promise<Watchlist> {
    return (
      await this.http.send('POST', `/watchlists/${enc(id)}/items`, watchlistResponseSchema, {
        instrumentKey,
      })
    ).data;
  }
  async removeWatchlistItem(id: string, instrumentKey: string): Promise<Watchlist> {
    return (
      await this.http.send(
        'DELETE',
        `/watchlists/${enc(id)}/items/${enc(instrumentKey)}`,
        watchlistResponseSchema,
      )
    ).data;
  }
  async reorderWatchlistItems(id: string, instrumentKeys: readonly string[]): Promise<Watchlist> {
    return (
      await this.http.send('PUT', `/watchlists/${enc(id)}/items/order`, watchlistResponseSchema, {
        instrumentKeys,
      })
    ).data;
  }
  async listAlerts(signal?: AbortSignal): Promise<Alert[]> {
    return (await this.http.get('/alerts', alertsResponseSchema, signal)).data;
  }
  async createAlert(input: CreateAlertInput): Promise<Alert> {
    return (await this.http.send('POST', '/alerts', alertResponseSchema, input)).data;
  }
  async updateAlert(
    id: string,
    patch: Parameters<UserDataClient['updateAlert']>[1],
  ): Promise<Alert> {
    return (await this.http.send('PATCH', `/alerts/${enc(id)}`, alertResponseSchema, patch)).data;
  }
  async deleteAlert(id: string): Promise<void> {
    await this.http.send('DELETE', `/alerts/${enc(id)}`, deletedResponseSchema);
  }
  async listNotifications(limit = 50, signal?: AbortSignal): Promise<AppNotification[]> {
    return (
      await this.http.get(`/notifications?limit=${limit}`, notificationsResponseSchema, signal)
    ).data;
  }
  async markNotificationsRead(ids: readonly string[] | 'all'): Promise<number> {
    return (await this.http.send('POST', '/notifications/read', markedResponseSchema, { ids })).data
      .marked;
  }
  async getPreferences(signal?: AbortSignal): Promise<Preferences> {
    return (await this.http.get('/preferences', preferencesResponseSchema, signal)).data;
  }
  async setPreferences(patch: Preferences): Promise<Preferences> {
    return (await this.http.send('PUT', '/preferences', preferencesResponseSchema, patch)).data;
  }
}
