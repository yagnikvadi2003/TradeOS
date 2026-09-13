import { type UserDataClient } from './market-data.client';
import {
  type Alert,
  type AppNotification,
  type CreateAlertInput,
  type Preferences,
  type Watchlist,
} from './user-data.schemas';

let counter = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`;

/* eslint-disable @typescript-eslint/require-await -- async for interface conformance */
/** In-memory twin of the user-data API for development and tests. Clearly not persistent. */
export class MockUserDataClient implements UserDataClient {
  private watchlists: Watchlist[] = [];
  private alerts: Alert[] = [];
  private notifications: AppNotification[] = [];
  private preferences: Preferences = {};
  constructor(private readonly now: () => number = () => Date.now()) {}

  async ensureSession() {
    return { id: '00000000-0000-4000-8000-000000000000', expiresAt: this.now() + 86_400_000 };
  }
  async listWatchlists(): Promise<Watchlist[]> {
    return this.watchlists.map((w) => ({ ...w, items: [...w.items] }));
  }
  async createWatchlist(name: string): Promise<Watchlist> {
    if (this.watchlists.some((w) => w.name === name)) throw new Error('Watchlist already exists');
    const w: Watchlist = {
      id: uuid(),
      name,
      position: this.watchlists.length,
      updatedAt: this.now(),
      items: [],
    };
    this.watchlists.push(w);
    return w;
  }
  private owned(id: string): Watchlist {
    const w = this.watchlists.find((x) => x.id === id);
    if (!w) throw new Error('Watchlist not found');
    return w;
  }
  async renameWatchlist(id: string, name: string): Promise<Watchlist> {
    const w = this.owned(id);
    w.name = name;
    return w;
  }
  async deleteWatchlist(id: string): Promise<void> {
    this.watchlists = this.watchlists.filter((w) => w.id !== id);
  }
  async addWatchlistItem(id: string, instrumentKey: string): Promise<Watchlist> {
    const w = this.owned(id);
    if (!w.items.some((i) => i.instrumentKey === instrumentKey)) {
      w.items = [...w.items, { instrumentKey, position: w.items.length, addedAt: this.now() }];
    }
    return w;
  }
  async removeWatchlistItem(id: string, instrumentKey: string): Promise<Watchlist> {
    const w = this.owned(id);
    w.items = w.items
      .filter((i) => i.instrumentKey !== instrumentKey)
      .map((i, position) => ({ ...i, position }));
    return w;
  }
  async reorderWatchlistItems(id: string, instrumentKeys: readonly string[]): Promise<Watchlist> {
    const w = this.owned(id);
    const order = new Map(instrumentKeys.map((k, i) => [k, i]));
    w.items = [...w.items]
      .sort((a, b) => (order.get(a.instrumentKey) ?? 99) - (order.get(b.instrumentKey) ?? 99))
      .map((i, position) => ({ ...i, position }));
    return w;
  }
  async listAlerts(): Promise<Alert[]> {
    return [...this.alerts];
  }
  async createAlert(input: CreateAlertInput): Promise<Alert> {
    const a: Alert = {
      id: uuid(),
      instrumentKey: input.instrumentKey,
      condition: input.condition,
      threshold: input.threshold,
      status: 'ACTIVE',
      repeat: input.repeat ?? false,
      note: input.note ?? null,
      triggeredAt: null,
      createdAt: this.now(),
    };
    this.alerts = [a, ...this.alerts];
    return a;
  }
  async updateAlert(
    id: string,
    patch: Parameters<UserDataClient['updateAlert']>[1],
  ): Promise<Alert> {
    const a = this.alerts.find((x) => x.id === id);
    if (!a) throw new Error('Alert not found');
    const next = { ...a, ...patch };
    this.alerts = this.alerts.map((x) => (x.id === id ? next : x));
    return next;
  }
  async deleteAlert(id: string): Promise<void> {
    this.alerts = this.alerts.filter((a) => a.id !== id);
  }
  /** Test hook: simulate a trigger arriving. */
  pushNotification(n: Omit<AppNotification, 'id' | 'readAt' | 'createdAt'>): AppNotification {
    const full = { ...n, id: uuid(), readAt: null, createdAt: this.now() };
    this.notifications = [full, ...this.notifications];
    return full;
  }
  async listNotifications(limit = 50): Promise<AppNotification[]> {
    return this.notifications.slice(0, limit);
  }
  async markNotificationsRead(ids: readonly string[] | 'all'): Promise<number> {
    let n = 0;
    this.notifications = this.notifications.map((x) => {
      if (x.readAt !== null || (ids !== 'all' && !ids.includes(x.id))) return x;
      n += 1;
      return { ...x, readAt: this.now() };
    });
    return n;
  }
  async getPreferences(): Promise<Preferences> {
    return { ...this.preferences };
  }
  async setPreferences(patch: Preferences): Promise<Preferences> {
    this.preferences = { ...this.preferences, ...patch };
    return { ...this.preferences };
  }
}
