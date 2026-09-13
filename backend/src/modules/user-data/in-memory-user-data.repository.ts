import { randomUUID } from 'node:crypto';
import { type ExchangeCode } from '@/common/market/market-primitives';
import {
  type Alert,
  type CalendarDay,
  LIMITS,
  type Notification,
  type Preferences,
  type SessionRecord,
  type UserDataRepository,
  type Watchlist,
  type WatchlistItem,
} from './user-data.types';

interface Wl {
  id: string;
  sessionId: string;
  name: string;
  position: number;
  items: WatchlistItem[];
  updatedAt: number;
}

/** Development / test store (no DATABASE_URL). Bounded per session like the SQL one. */
export class InMemoryUserDataRepository implements UserDataRepository {
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly watchlists = new Map<string, Wl>();
  private readonly alerts = new Map<string, Alert>();
  private readonly notifications = new Map<string, Notification & { sessionId: string }>();
  private readonly prefs = new Map<string, Preferences>();
  readonly calendar: CalendarDay[] = [];

  constructor(private readonly now: () => number = () => Date.now()) {}

  async createSession(expiresAt: number): Promise<SessionRecord> {
    const s: SessionRecord = {
      id: randomUUID(),
      createdAt: this.now(),
      expiresAt,
      revokedAt: null,
    };
    this.sessions.set(s.id, s);
    return s;
  }
  async getSession(id: string): Promise<SessionRecord | null> {
    return this.sessions.get(id) ?? null;
  }
  async touchSession(id: string, expiresAt: number): Promise<void> {
    const s = this.sessions.get(id);
    if (s) this.sessions.set(id, { ...s, expiresAt });
  }
  async revokeSession(id: string): Promise<void> {
    const s = this.sessions.get(id);
    if (s) this.sessions.set(id, { ...s, revokedAt: this.now() });
  }

  private wls(sessionId: string): Wl[] {
    return [...this.watchlists.values()]
      .filter((w) => w.sessionId === sessionId)
      .sort((a, b) => a.position - b.position);
  }
  private view(w: Wl): Watchlist {
    return {
      id: w.id,
      name: w.name,
      position: w.position,
      items: [...w.items].sort((a, b) => a.position - b.position),
      updatedAt: w.updatedAt,
    };
  }
  async listWatchlists(sessionId: string): Promise<Watchlist[]> {
    return this.wls(sessionId).map((w) => this.view(w));
  }
  async createWatchlist(sessionId: string, name: string): Promise<Watchlist> {
    const existing = this.wls(sessionId);
    if (existing.length >= LIMITS.watchlistsPerSession) throw new Error('LIMIT');
    if (existing.some((w) => w.name === name)) throw new Error('CONFLICT');
    const w: Wl = {
      id: randomUUID(),
      sessionId,
      name,
      position: existing.length,
      items: [],
      updatedAt: this.now(),
    };
    this.watchlists.set(w.id, w);
    return this.view(w);
  }
  private owned(sessionId: string, id: string): Wl | null {
    const w = this.watchlists.get(id);
    return w?.sessionId === sessionId ? w : null;
  }
  async renameWatchlist(sessionId: string, id: string, name: string): Promise<Watchlist | null> {
    const w = this.owned(sessionId, id);
    if (!w) return null;
    if (this.wls(sessionId).some((o) => o.id !== id && o.name === name))
      throw new Error('CONFLICT');
    w.name = name;
    w.updatedAt = this.now();
    return this.view(w);
  }
  async deleteWatchlist(sessionId: string, id: string): Promise<boolean> {
    return this.owned(sessionId, id) ? this.watchlists.delete(id) : false;
  }
  async reorderWatchlists(sessionId: string, ids: readonly string[]): Promise<void> {
    ids.forEach((id, i) => {
      const w = this.owned(sessionId, id);
      if (w) w.position = i;
    });
  }
  async addWatchlistItem(
    sessionId: string,
    id: string,
    instrumentKey: string,
  ): Promise<Watchlist | null> {
    const w = this.owned(sessionId, id);
    if (!w) return null;
    if (w.items.some((i) => i.instrumentKey === instrumentKey)) return this.view(w);
    if (w.items.length >= LIMITS.itemsPerWatchlist) throw new Error('LIMIT');
    w.items.push({ instrumentKey, position: w.items.length, addedAt: this.now() });
    w.updatedAt = this.now();
    return this.view(w);
  }
  async removeWatchlistItem(
    sessionId: string,
    id: string,
    instrumentKey: string,
  ): Promise<Watchlist | null> {
    const w = this.owned(sessionId, id);
    if (!w) return null;
    w.items = w.items
      .filter((i) => i.instrumentKey !== instrumentKey)
      .map((i, p) => ({ ...i, position: p }));
    w.updatedAt = this.now();
    return this.view(w);
  }
  async reorderWatchlistItems(
    sessionId: string,
    id: string,
    keys: readonly string[],
  ): Promise<Watchlist | null> {
    const w = this.owned(sessionId, id);
    if (!w) return null;
    const order = new Map(keys.map((k, i) => [k, i]));
    w.items = w.items.map((i) => ({
      ...i,
      position: order.get(i.instrumentKey) ?? i.position + keys.length,
    }));
    w.updatedAt = this.now();
    return this.view(w);
  }

  async listAlerts(sessionId: string): Promise<Alert[]> {
    return [...this.alerts.values()]
      .filter((a) => a.sessionId === sessionId)
      .sort((a, b) => b.createdAt - a.createdAt);
  }
  async createAlert(
    input: Omit<Alert, 'id' | 'status' | 'triggeredAt' | 'createdAt'>,
  ): Promise<Alert> {
    const active = (await this.listAlerts(input.sessionId)).filter((a) => a.status === 'ACTIVE');
    if (active.length >= LIMITS.activeAlertsPerSession) throw new Error('LIMIT');
    const a: Alert = {
      ...input,
      id: randomUUID(),
      status: 'ACTIVE',
      triggeredAt: null,
      createdAt: this.now(),
    };
    this.alerts.set(a.id, a);
    return a;
  }
  async updateAlert(
    sessionId: string,
    id: string,
    patch: Partial<Pick<Alert, 'threshold' | 'status' | 'repeat' | 'note'>>,
  ): Promise<Alert | null> {
    const a = this.alerts.get(id);
    if (a?.sessionId !== sessionId) return null;
    const next = { ...a, ...patch };
    this.alerts.set(id, next);
    return next;
  }
  async deleteAlert(sessionId: string, id: string): Promise<boolean> {
    const a = this.alerts.get(id);
    return a?.sessionId === sessionId ? this.alerts.delete(id) : false;
  }
  async listActiveAlerts(): Promise<Alert[]> {
    return [...this.alerts.values()].filter((a) => a.status === 'ACTIVE');
  }
  async markTriggered(id: string, at: number, rearm: boolean): Promise<void> {
    const a = this.alerts.get(id);
    if (a) this.alerts.set(id, { ...a, triggeredAt: at, status: rearm ? 'ACTIVE' : 'TRIGGERED' });
  }

  async listNotifications(sessionId: string, limit: number): Promise<Notification[]> {
    return [...this.notifications.values()]
      .filter((n) => n.sessionId === sessionId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit)
      .map(({ sessionId: _s, ...n }) => n);
  }
  async createNotification(
    sessionId: string,
    input: Omit<Notification, 'id' | 'readAt' | 'createdAt'>,
  ): Promise<Notification> {
    const n = { ...input, id: randomUUID(), readAt: null, createdAt: this.now(), sessionId };
    this.notifications.set(n.id, n);
    const mine = [...this.notifications.values()]
      .filter((x) => x.sessionId === sessionId)
      .sort((a, b) => b.createdAt - a.createdAt);
    for (const old of mine.slice(LIMITS.notificationsPerSession)) this.notifications.delete(old.id);
    const { sessionId: _s, ...view } = n;
    return view;
  }
  async markNotificationsRead(sessionId: string, ids: readonly string[] | 'all'): Promise<number> {
    let count = 0;
    for (const n of this.notifications.values()) {
      if (n.sessionId !== sessionId || n.readAt !== null) continue;
      if (ids === 'all' || ids.includes(n.id)) {
        this.notifications.set(n.id, { ...n, readAt: this.now() });
        count += 1;
      }
    }
    return count;
  }

  async getPreferences(sessionId: string): Promise<Preferences> {
    return { ...(this.prefs.get(sessionId) ?? {}) };
  }
  async setPreferences(sessionId: string, patch: Preferences): Promise<Preferences> {
    const next = { ...(this.prefs.get(sessionId) ?? {}), ...patch };
    this.prefs.set(sessionId, next);
    return { ...next };
  }

  async listCalendarDays(
    exchangeCode: ExchangeCode,
    from: string,
    to: string,
  ): Promise<CalendarDay[]> {
    return this.calendar
      .filter((d) => d.exchangeCode === exchangeCode && d.date >= from && d.date <= to)
      .sort((a, b) => (a.date < b.date ? -1 : 1));
  }
}
