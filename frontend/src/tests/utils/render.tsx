import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderOptions } from '@testing-library/react';
import { type ReactElement, type ReactNode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { MarketDataProvider } from '@/app/providers/market-data-provider';
import { MarketStreamProvider } from '@/app/providers/market-stream-provider';
import { type MarketStream } from '@/services/websocket/market-stream';
import { MockMarketStream } from '@/services/websocket/mock-market-stream';
import { routes } from '@/app/router/routes';
import { MockMarketDataClient, type MarketDataClient } from '@/services/api';

const FIXED_NOW = Date.UTC(2026, 8, 8, 5, 30); // Tue 08 Sep 2026 11:00 IST — regular session

export function createTestClient(
  overrides: Partial<ConstructorParameters<typeof MockMarketDataClient>[0]> = {},
) {
  return new MockMarketDataClient({ latencyMs: 0, now: () => FIXED_NOW, ...overrides });
}

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: Infinity } },
  });
}

interface ProviderOptions {
  client?: MarketDataClient;
  /** Manual by default: ticks only when a test calls `stream.tick()`. */
  stream?: MarketStream;
}

export function createTestStream(options: ConstructorParameters<typeof MockMarketStream>[0] = {}) {
  return new MockMarketStream({ manual: true, now: () => FIXED_NOW, ...options });
}

export function renderWithProviders(
  ui: ReactElement,
  {
    client = createTestClient(),
    stream = createTestStream(),
    ...options
  }: ProviderOptions & Omit<RenderOptions, 'wrapper'> = {},
) {
  const queryClient = createTestQueryClient();
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MarketDataProvider client={client}>
          <MarketStreamProvider stream={stream}>{children}</MarketStreamProvider>
        </MarketDataProvider>
      </QueryClientProvider>
    );
  }
  return render(ui, { wrapper: Wrapper, ...options });
}

/** Mount the real route table at a given URL. */
export function renderApp(
  initialPath: string,
  { client = createTestClient(), stream = createTestStream() }: ProviderOptions = {},
) {
  const router = createMemoryRouter(routes, { initialEntries: [initialPath] });
  const queryClient = createTestQueryClient();
  const result = render(
    <QueryClientProvider client={queryClient}>
      <MarketDataProvider client={client}>
        <MarketStreamProvider stream={stream}>
          <RouterProvider router={router} />
        </MarketStreamProvider>
      </MarketDataProvider>
    </QueryClientProvider>,
  );
  return { ...result, router, stream };
}

export { FIXED_NOW };
