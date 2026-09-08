/**
 * Route path builders. Kept dependency-free (relative imports only) because
 * the Vite SEO plugin imports this file at build time to derive the sitemap.
 */
import { type MarketIndexPath } from '../../features/market/config/market.catalog';

export const ROUTE_PARAM = {
  exchange: 'exchange',
  category: 'category',
  index: 'index',
} as const;

export const paths = {
  home: '/',
  markets: '/markets',
  /** `/markets/:exchange/:category/:index` */
  marketIndex: (path: MarketIndexPath): string =>
    `/markets/${path.exchange}/${path.category}/${path.index}`,
  /** `/markets/:exchange/:category/:index/option-chain` */
  optionChain: (path: MarketIndexPath): string => `${paths.marketIndex(path)}/option-chain`,
} as const;

/** Route patterns used by the router definition. */
export const routePatterns = {
  markets: '/markets',
  marketIndex: `/markets/:${ROUTE_PARAM.exchange}/:${ROUTE_PARAM.category}/:${ROUTE_PARAM.index}`,
  optionChain: `/markets/:${ROUTE_PARAM.exchange}/:${ROUTE_PARAM.category}/:${ROUTE_PARAM.index}/option-chain`,
} as const;

/**
 * Search-engine visibility of a route family. Trading screens that will sit
 * behind authentication (option chain, live data) are private and noindex;
 * market/instrument information pages are public.
 */
export type RouteVisibility = 'public' | 'private';

export const routeVisibility: Record<keyof typeof routePatterns, RouteVisibility> = {
  markets: 'public',
  marketIndex: 'public',
  optionChain: 'private',
};

/** URL path prefixes that must never be indexed (consumed by robots.txt). */
export const PRIVATE_PATH_PATTERNS: readonly string[] = ['/markets/*/*/*/option-chain'];
