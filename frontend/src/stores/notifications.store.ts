import { create } from 'zustand';
import { type AppNotification } from '@/services/api/user-data.schemas';

interface NotificationsStore {
  readonly items: readonly AppNotification[];
  readonly unread: number;
  readonly seeded: boolean;
  seed: (items: readonly AppNotification[]) => void;
  push: (n: AppNotification) => void;
  markRead: (ids: readonly string[] | 'all') => void;
}

const MAX = 200;

/** In-app inbox: seeded from REST once, then fed by `notification` stream frames. */
export const useNotificationsStore = create<NotificationsStore>((set) => ({
  items: [],
  unread: 0,
  seeded: false,
  // Merge, never replace: a stream frame may land before the REST seed resolves.
  seed: (items) =>
    set((s) => {
      const known = new Set(s.items.map((n) => n.id));
      const merged = [...s.items, ...items.filter((n) => !known.has(n.id))]
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, MAX);
      return {
        items: merged,
        unread: merged.filter((n) => n.readAt === null).length,
        seeded: true,
      };
    }),
  push: (n) =>
    set((s) => {
      if (s.items.some((x) => x.id === n.id)) return s;
      const items = [n, ...s.items].slice(0, MAX);
      return { items, unread: items.filter((x) => x.readAt === null).length };
    }),
  markRead: (ids) =>
    set((s) => {
      const at = Date.now();
      const items = s.items.map((n) =>
        n.readAt === null && (ids === 'all' || ids.includes(n.id)) ? { ...n, readAt: at } : n,
      );
      return { items, unread: items.filter((n) => n.readAt === null).length };
    }),
}));
