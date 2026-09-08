import { Suspense } from 'react';
import { createBrowserRouter, Navigate, type RouteObject } from 'react-router';
import { TerminalLayout } from '@/app/layouts/terminal-layout';
import { MarketIndexPage } from '@/features/market/pages/market-index.page';
import { MarketsOverviewPage } from '@/features/market/pages/markets-overview.page';
import { OptionChainPage } from './lazy-pages';
import { paths, routePatterns } from './paths';
import { NotFoundPage, RouteFallback } from './route-fallbacks';

/** Route table. Kept as data so tests can mount it with a memory router. */
export const routes: RouteObject[] = [
  {
    element: <TerminalLayout />,
    children: [
      { index: true, element: <Navigate to={paths.markets} replace /> },
      { path: routePatterns.markets, element: <MarketsOverviewPage /> },
      { path: routePatterns.marketIndex, element: <MarketIndexPage /> },
      {
        path: routePatterns.optionChain,
        element: (
          <Suspense fallback={<RouteFallback />}>
            <OptionChainPage />
          </Suspense>
        ),
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

export function createAppRouter() {
  return createBrowserRouter(routes);
}
