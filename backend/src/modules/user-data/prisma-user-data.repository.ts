import { type ExchangeCode, toIsoDate } from '@/common/market/market-primitives';
import { type PrismaService } from '@/infrastructure/database/prisma.service';
import {
  type Alert,
  type CalendarDay,
  LIMITS,
  type Notification,
  type Preferences,
  type SessionRecord,
  type UserDataRepository,
  type Watchlist,
} from './user-data.types';

interface WlRow {
  id: string;
  name: string;
  position: number;
  updatedAt: Date;
  items: { instrumentKey: string; position: number; createdAt: Date }[];
}
interface AlertRow {
  id: string;
  sessionId: string;
  instrumentKey: string;
  condition: Alert['condition'];
  threshold: { toNumber(): number };
  status: Alert['status'];
  repeat: boolean;
  note: string | null;
  triggeredAt: Date | null;
  createdAt: Date;
}
interface NotificationRow {
  id: string;
  alertId: string | null;
  title: string;
  body: string;
  value: { toNumber(): number } | null;
  readAt: Date | null;
  createdAt: Date;
}

const ms = (d: Date | null): number | null => (d ? d.getTime() : null);
const wl = (r: WlRow): Watchlist => ({
  id: r.id,
  name: r.name,
  position: r.position,
  updatedAt: r.updatedAt.getTime(),
  items: [...r.items]
    .sort((a, b) => a.position - b.position)
    .map((i) => ({
      instrumentKey: i.instrumentKey,
      position: i.position,
      addedAt: i.createdAt.getTime(),
    })),
});
const alert = (r: AlertRow): Alert => ({
  id: r.id,
  sessionId: r.sessionId,
  instrumentKey: r.instrumentKey,
  condition: r.condition,
  threshold: r.threshold.toNumber(),
  status: r.status,
  repeat: r.repeat,
  note: r.note,
  triggeredAt: ms(r.triggeredAt),
  createdAt: r.createdAt.getTime(),
});
const notification = (r: NotificationRow): Notification => ({
  id: r.id,
  alertId: r.alertId,
  title: r.title,
  body: r.body,
  value: r.value ? r.value.toNumber() : null,
  readAt: ms(r.readAt),
  createdAt: r.createdAt.getTime(),
});
const ITEMS = { items: { orderBy: { position: 'asc' as const } } };

/**
 * PostgreSQL store. Ownership is a WHERE clause on every statement; limits
 * are enforced before insert; mutations that touch several rows run in a
 * transaction so a reorder is all-or-nothing.
 */
export class PrismaUserDataRepository implements UserDataRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createSession(expiresAt: number): Promise<SessionRecord> {
    const r = await this.prisma.session.create({ data: { expiresAt: new Date(expiresAt) } });
    return {
      id: r.id,
      createdAt: r.createdAt.getTime(),
      expiresAt: r.expiresAt.getTime(),
      revokedAt: ms(r.revokedAt),
    };
  }
  async getSession(id: string): Promise<SessionRecord | null> {
    const r = await this.prisma.session.findUnique({ where: { id } });
    return r
      ? {
          id: r.id,
          createdAt: r.createdAt.getTime(),
          expiresAt: r.expiresAt.getTime(),
          revokedAt: ms(r.revokedAt),
        }
      : null;
  }
  async touchSession(id: string, expiresAt: number): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id },
      data: { expiresAt: new Date(expiresAt), lastSeenAt: new Date() },
    });
  }
  async revokeSession(id: string): Promise<void> {
    await this.prisma.session.updateMany({ where: { id }, data: { revokedAt: new Date() } });
  }

  async listWatchlists(sessionId: string): Promise<Watchlist[]> {
    const rows = await this.prisma.watchlist.findMany({
      where: { sessionId },
      orderBy: { position: 'asc' },
      include: ITEMS,
    });
    return rows.map(wl);
  }
  async createWatchlist(sessionId: string, name: string): Promise<Watchlist> {
    const count = await this.prisma.watchlist.count({ where: { sessionId } });
    if (count >= LIMITS.watchlistsPerSession) throw new Error('LIMIT');
    try {
      const r = await this.prisma.watchlist.create({
        data: { sessionId, name, position: count },
        include: ITEMS,
      });
      return wl(r);
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002')
        throw new Error('CONFLICT', { cause: error });
      throw error;
    }
  }
  async renameWatchlist(sessionId: string, id: string, name: string): Promise<Watchlist | null> {
    try {
      const updated = await this.prisma.watchlist.updateMany({
        where: { id, sessionId },
        data: { name },
      });
      if (updated.count === 0) return null;
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002')
        throw new Error('CONFLICT', { cause: error });
      throw error;
    }
    const r = await this.prisma.watchlist.findUnique({ where: { id }, include: ITEMS });
    return r ? wl(r) : null;
  }
  async deleteWatchlist(sessionId: string, id: string): Promise<boolean> {
    return (await this.prisma.watchlist.deleteMany({ where: { id, sessionId } })).count > 0;
  }
  async reorderWatchlists(sessionId: string, ids: readonly string[]): Promise<void> {
    await this.prisma.$transaction(
      ids.map((id, position) =>
        this.prisma.watchlist.updateMany({ where: { id, sessionId }, data: { position } }),
      ),
    );
  }
  private async ownedWatchlist(sessionId: string, id: string): Promise<WlRow | null> {
    return this.prisma.watchlist.findFirst({ where: { id, sessionId }, include: ITEMS });
  }
  async addWatchlistItem(
    sessionId: string,
    id: string,
    instrumentKey: string,
  ): Promise<Watchlist | null> {
    const w = await this.ownedWatchlist(sessionId, id);
    if (!w) return null;
    if (w.items.some((i) => i.instrumentKey === instrumentKey)) return wl(w);
    if (w.items.length >= LIMITS.itemsPerWatchlist) throw new Error('LIMIT');
    await this.prisma.watchlistItem.create({
      data: { watchlistId: id, instrumentKey, position: w.items.length },
    });
    return wl((await this.ownedWatchlist(sessionId, id))!);
  }
  async removeWatchlistItem(
    sessionId: string,
    id: string,
    instrumentKey: string,
  ): Promise<Watchlist | null> {
    const w = await this.ownedWatchlist(sessionId, id);
    if (!w) return null;
    await this.prisma.watchlistItem.deleteMany({ where: { watchlistId: id, instrumentKey } });
    return wl((await this.ownedWatchlist(sessionId, id))!);
  }
  async reorderWatchlistItems(
    sessionId: string,
    id: string,
    keys: readonly string[],
  ): Promise<Watchlist | null> {
    const w = await this.ownedWatchlist(sessionId, id);
    if (!w) return null;
    await this.prisma.$transaction(
      keys.map((instrumentKey, position) =>
        this.prisma.watchlistItem.updateMany({
          where: { watchlistId: id, instrumentKey },
          data: { position },
        }),
      ),
    );
    return wl((await this.ownedWatchlist(sessionId, id))!);
  }

  async listAlerts(sessionId: string): Promise<Alert[]> {
    const rows = await this.prisma.alert.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(alert);
  }
  async createAlert(
    input: Omit<Alert, 'id' | 'status' | 'triggeredAt' | 'createdAt'>,
  ): Promise<Alert> {
    const active = await this.prisma.alert.count({
      where: { sessionId: input.sessionId, status: 'ACTIVE' },
    });
    if (active >= LIMITS.activeAlertsPerSession) throw new Error('LIMIT');
    const r = await this.prisma.alert.create({
      data: {
        sessionId: input.sessionId,
        instrumentKey: input.instrumentKey,
        condition: input.condition,
        threshold: input.threshold,
        repeat: input.repeat,
        note: input.note,
      },
    });
    return alert(r);
  }
  async updateAlert(
    sessionId: string,
    id: string,
    patch: Partial<Pick<Alert, 'threshold' | 'status' | 'repeat' | 'note'>>,
  ): Promise<Alert | null> {
    const updated = await this.prisma.alert.updateMany({ where: { id, sessionId }, data: patch });
    if (updated.count === 0) return null;
    const r = await this.prisma.alert.findUnique({ where: { id } });
    return r ? alert(r) : null;
  }
  async deleteAlert(sessionId: string, id: string): Promise<boolean> {
    return (await this.prisma.alert.deleteMany({ where: { id, sessionId } })).count > 0;
  }
  async listActiveAlerts(): Promise<Alert[]> {
    return (await this.prisma.alert.findMany({ where: { status: 'ACTIVE' } })).map(alert);
  }
  async markTriggered(id: string, at: number, rearm: boolean): Promise<void> {
    await this.prisma.alert.updateMany({
      where: { id },
      data: { triggeredAt: new Date(at), status: rearm ? 'ACTIVE' : 'TRIGGERED' },
    });
  }

  async listNotifications(sessionId: string, limit: number): Promise<Notification[]> {
    const rows = await this.prisma.notification.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map(notification);
  }
  async createNotification(
    sessionId: string,
    input: Omit<Notification, 'id' | 'readAt' | 'createdAt'>,
  ): Promise<Notification> {
    const r = await this.prisma.notification.create({
      data: {
        sessionId,
        alertId: input.alertId,
        title: input.title,
        body: input.body,
        value: input.value,
      },
    });
    // Bounded per session: keep the newest N.
    const overflow = await this.prisma.notification.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
      skip: LIMITS.notificationsPerSession,
      select: { id: true },
    });
    if (overflow.length)
      await this.prisma.notification.deleteMany({
        where: { id: { in: overflow.map((o) => o.id) } },
      });
    return notification(r);
  }
  async markNotificationsRead(sessionId: string, ids: readonly string[] | 'all'): Promise<number> {
    const where =
      ids === 'all'
        ? { sessionId, readAt: null }
        : { sessionId, readAt: null, id: { in: [...ids] } };
    return (await this.prisma.notification.updateMany({ where, data: { readAt: new Date() } }))
      .count;
  }

  async getPreferences(sessionId: string): Promise<Preferences> {
    const rows = await this.prisma.preference.findMany({ where: { sessionId } });
    return Object.fromEntries(rows.map((r) => [r.key, r.value as unknown]));
  }
  async setPreferences(sessionId: string, patch: Preferences): Promise<Preferences> {
    await this.prisma.$transaction(
      Object.entries(patch).map(([key, value]) =>
        this.prisma.preference.upsert({
          where: { sessionId_key: { sessionId, key } },
          create: { sessionId, key, value: value as never },
          update: { value: value as never },
        }),
      ),
    );
    return this.getPreferences(sessionId);
  }

  async listCalendarDays(
    exchangeCode: ExchangeCode,
    from: string,
    to: string,
  ): Promise<CalendarDay[]> {
    const rows = await this.prisma.marketCalendarDay.findMany({
      where: {
        exchangeCode,
        date: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) },
      },
      orderBy: { date: 'asc' },
    });
    return rows.map((r) => ({
      exchangeCode: r.exchangeCode,
      date: toIsoDate(r.date),
      kind: r.kind,
      description: r.description,
      openMinutes: r.openMinutes,
      closeMinutes: r.closeMinutes,
    }));
  }
}
