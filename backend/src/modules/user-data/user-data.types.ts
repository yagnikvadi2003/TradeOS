import { type ExchangeCode } from '@/common/market/market-primitives';

export interface SessionRecord {
  readonly id: string;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly revokedAt: number | null;
}

export interface WatchlistItem {
  readonly instrumentKey: string;
  readonly position: number;
  readonly addedAt: number;
}
export interface Watchlist {
  readonly id: string;
  readonly name: string;
  readonly position: number;
  readonly items: readonly WatchlistItem[];
  readonly updatedAt: number;
}

export const ALERT_CONDITIONS = [
  'PRICE_ABOVE',
  'PRICE_BELOW',
  'CHANGE_PERCENT_ABOVE',
  'CHANGE_PERCENT_BELOW',
  'VOLUME_ABOVE',
  'OI_CHANGE_ABOVE',
  'IV_ABOVE',
  'IV_BELOW',
  'PCR_ABOVE',
  'PCR_BELOW',
] as const;
export type AlertCondition = (typeof ALERT_CONDITIONS)[number];
export type AlertStatus = 'ACTIVE' | 'TRIGGERED' | 'DISABLED';

export interface Alert {
  readonly id: string;
  readonly sessionId: string;
  readonly instrumentKey: string;
  readonly condition: AlertCondition;
  readonly threshold: number;
  readonly status: AlertStatus;
  readonly repeat: boolean;
  readonly note: string | null;
  readonly triggeredAt: number | null;
  readonly createdAt: number;
}

export interface Notification {
  readonly id: string;
  readonly alertId: string | null;
  readonly title: string;
  readonly body: string;
  readonly value: number | null;
  readonly readAt: number | null;
  readonly createdAt: number;
}

export type Preferences = Record<string, unknown>;

export interface CalendarDay {
  readonly exchangeCode: ExchangeCode;
  readonly date: string;
  readonly kind: 'HOLIDAY' | 'SPECIAL_SESSION';
  readonly description: string;
  readonly openMinutes: number | null;
  readonly closeMinutes: number | null;
}

export const LIMITS = {
  watchlistsPerSession: 10,
  itemsPerWatchlist: 50,
  activeAlertsPerSession: 50,
  notificationsPerSession: 200,
} as const;

/**
 * Durable, session-scoped user data. Every method takes the owning session
 * id and only ever touches that session's rows — ownership is enforced in
 * the repository, so a controller cannot forget it.
 */
export interface UserDataRepository {
  createSession(expiresAt: number): Promise<SessionRecord>;
  getSession(id: string): Promise<SessionRecord | null>;
  touchSession(id: string, expiresAt: number): Promise<void>;
  revokeSession(id: string): Promise<void>;

  listWatchlists(sessionId: string): Promise<Watchlist[]>;
  createWatchlist(sessionId: string, name: string): Promise<Watchlist>;
  renameWatchlist(sessionId: string, id: string, name: string): Promise<Watchlist | null>;
  deleteWatchlist(sessionId: string, id: string): Promise<boolean>;
  reorderWatchlists(sessionId: string, ids: readonly string[]): Promise<void>;
  addWatchlistItem(sessionId: string, id: string, instrumentKey: string): Promise<Watchlist | null>;
  removeWatchlistItem(
    sessionId: string,
    id: string,
    instrumentKey: string,
  ): Promise<Watchlist | null>;
  reorderWatchlistItems(
    sessionId: string,
    id: string,
    keys: readonly string[],
  ): Promise<Watchlist | null>;

  listAlerts(sessionId: string): Promise<Alert[]>;
  createAlert(input: Omit<Alert, 'id' | 'status' | 'triggeredAt' | 'createdAt'>): Promise<Alert>;
  updateAlert(
    sessionId: string,
    id: string,
    patch: Partial<Pick<Alert, 'threshold' | 'status' | 'repeat' | 'note'>>,
  ): Promise<Alert | null>;
  deleteAlert(sessionId: string, id: string): Promise<boolean>;
  /** Every ACTIVE alert across sessions (engine warm-up). */
  listActiveAlerts(): Promise<Alert[]>;
  markTriggered(id: string, at: number, rearm: boolean): Promise<void>;

  listNotifications(sessionId: string, limit: number): Promise<Notification[]>;
  createNotification(
    sessionId: string,
    input: Omit<Notification, 'id' | 'readAt' | 'createdAt'>,
  ): Promise<Notification>;
  markNotificationsRead(sessionId: string, ids: readonly string[] | 'all'): Promise<number>;

  getPreferences(sessionId: string): Promise<Preferences>;
  setPreferences(sessionId: string, patch: Preferences): Promise<Preferences>;

  listCalendarDays(exchangeCode: ExchangeCode, from: string, to: string): Promise<CalendarDay[]>;
}

export const USER_DATA_REPOSITORY = Symbol('USER_DATA_REPOSITORY');
