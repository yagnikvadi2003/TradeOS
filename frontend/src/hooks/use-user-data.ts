import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useMarketDataClient } from '@/app/providers/use-market-data-client';
import { useMarketStream } from '@/app/providers/use-market-stream';
import { type CreateAlertInput, type Preferences } from '@/services/api/user-data.schemas';
import { useNotificationsStore } from '@/stores/notifications.store';

export const userDataKeys = {
  session: ['session'] as const,
  watchlists: ['watchlists'] as const,
  alerts: ['alerts'] as const,
  preferences: ['preferences'] as const,
};

/** Establishes the device session once per app load (sets the cookie). */
export function useSession() {
  const client = useMarketDataClient();
  return useQuery({
    queryKey: userDataKeys.session,
    queryFn: ({ signal }) => client.ensureSession(signal),
    staleTime: Infinity,
    retry: 1,
  });
}

export function useWatchlists() {
  const client = useMarketDataClient();
  const session = useSession();
  return useQuery({
    queryKey: userDataKeys.watchlists,
    queryFn: ({ signal }) => client.listWatchlists(signal),
    enabled: session.isSuccess,
    staleTime: 60_000,
  });
}

export function useWatchlistMutations() {
  const client = useMarketDataClient();
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: userDataKeys.watchlists });
  return {
    create: useMutation({
      mutationFn: (name: string) => client.createWatchlist(name),
      onSuccess: refresh,
    }),
    rename: useMutation({
      mutationFn: (v: { id: string; name: string }) => client.renameWatchlist(v.id, v.name),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: (id: string) => client.deleteWatchlist(id),
      onSuccess: refresh,
    }),
    addItem: useMutation({
      mutationFn: (v: { id: string; instrumentKey: string }) =>
        client.addWatchlistItem(v.id, v.instrumentKey),
      onSuccess: refresh,
    }),
    removeItem: useMutation({
      mutationFn: (v: { id: string; instrumentKey: string }) =>
        client.removeWatchlistItem(v.id, v.instrumentKey),
      onSuccess: refresh,
    }),
    reorderItems: useMutation({
      mutationFn: (v: { id: string; instrumentKeys: string[] }) =>
        client.reorderWatchlistItems(v.id, v.instrumentKeys),
      onSuccess: refresh,
    }),
  };
}

export function useAlerts() {
  const client = useMarketDataClient();
  const session = useSession();
  return useQuery({
    queryKey: userDataKeys.alerts,
    queryFn: ({ signal }) => client.listAlerts(signal),
    enabled: session.isSuccess,
    staleTime: 30_000,
  });
}

export function useAlertMutations() {
  const client = useMarketDataClient();
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: userDataKeys.alerts });
  return {
    create: useMutation({
      mutationFn: (input: CreateAlertInput) => client.createAlert(input),
      onSuccess: refresh,
    }),
    remove: useMutation({ mutationFn: (id: string) => client.deleteAlert(id), onSuccess: refresh }),
    toggle: useMutation({
      mutationFn: (v: { id: string; status: 'ACTIVE' | 'DISABLED' }) =>
        client.updateAlert(v.id, { status: v.status }),
      onSuccess: refresh,
    }),
  };
}

/**
 * Seeds the inbox from REST once, then listens to `notification` stream
 * frames; a trigger also re-fetches alerts (status changed server-side).
 */
export function useNotificationsFeed(): void {
  const client = useMarketDataClient();
  const stream = useMarketStream();
  const qc = useQueryClient();
  const session = useSession();
  const seeded = useNotificationsStore((s) => s.seeded);
  useEffect(() => {
    if (!session.isSuccess || seeded) return;
    const ac = new AbortController();
    client
      .listNotifications(50, ac.signal)
      .then((items) => useNotificationsStore.getState().seed(items))
      .catch(() => useNotificationsStore.getState().seed([]));
    return () => ac.abort();
  }, [client, session.isSuccess, seeded]);
  useEffect(
    () =>
      stream.onNotification((n) => {
        useNotificationsStore.getState().push({ ...n, readAt: null });
        void qc.invalidateQueries({ queryKey: userDataKeys.alerts });
        if (
          typeof Notification !== 'undefined' &&
          Notification.permission === 'granted' &&
          document.visibilityState !== 'visible'
        ) {
          try {
            new Notification(n.title, { body: n.body, tag: n.id });
          } catch {
            /* browser refused; the in-app inbox still has it */
          }
        }
      }),
    [stream, qc],
  );
}

export function useMarkNotificationsRead() {
  const client = useMarketDataClient();
  return useMutation({
    mutationFn: (ids: readonly string[] | 'all') => client.markNotificationsRead(ids),
    onMutate: (ids) => useNotificationsStore.getState().markRead(ids),
  });
}

export function usePreferences() {
  const client = useMarketDataClient();
  const session = useSession();
  return useQuery({
    queryKey: userDataKeys.preferences,
    queryFn: ({ signal }) => client.getPreferences(signal),
    enabled: session.isSuccess,
    staleTime: Infinity,
  });
}

export function useSetPreferences() {
  const client = useMarketDataClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Preferences) => client.setPreferences(patch),
    onSuccess: (data) => qc.setQueryData(userDataKeys.preferences, data),
  });
}
