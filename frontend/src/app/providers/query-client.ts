import { QueryClient } from '@tanstack/react-query';

/**
 * Query defaults tuned for a low-resource deployment: no window-focus
 * refetch storms, no interval polling (realtime is WebSocket-driven), and a
 * short retry budget so failures surface quickly in the UI.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: 1,
        retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 8_000),
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        refetchInterval: false,
      },
    },
  });
}
