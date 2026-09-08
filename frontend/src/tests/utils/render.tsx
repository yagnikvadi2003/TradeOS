import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderOptions } from '@testing-library/react';
import { type ReactElement, type ReactNode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { MarketDataProvider } from '@/app/providers/market-data-provider';
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
}

export function renderWithProviders(
  ui: ReactElement,
  {
    client = createTestClient(),
    ...options
  }: ProviderOptions & Omit<RenderOptions, 'wrapper'> = {},
) {
  const queryClient = createTestQueryClient();
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MarketDataProvider client={client}>{children}</MarketDataProvider>
      </QueryClientProvider>
    );
  }
  return render(ui, { wrapper: Wrapper, ...options });
}

/** Mount the real route table at a given URL. */
export function renderApp(
  initialPath: string,
  { client = createTestClient() }: ProviderOptions = {},
) {
  const router = createMemoryRouter(routes, { initialEntries: [initialPath] });
  const queryClient = createTestQueryClient();
  const result = render(
    <QueryClientProvider client={queryClient}>
      <MarketDataProvider client={client}>
        <RouterProvider router={router} />
      </MarketDataProvider>
    </QueryClientProvider>,
  );
  return { ...result, router };
}

export { FIXED_NOW };
