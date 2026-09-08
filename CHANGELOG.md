# Changelog

All notable changes to TradeOS are documented here. The format follows Keep a Changelog.

## [0.1.0] — Phase 1

### Added

- pnpm monorepo skeleton with `verify` pipeline (typecheck, lint, test, build) and GitHub CI.
- Frontend application shell: terminal layout (top bar, ticker strip, navigator, status footer),
  React Router 7 routes for `/markets` and `/markets/:exchange/:category/:index[/option-chain]`.
- Typed market domain (`Exchange`, `MarketCategory`, `MarketIndex`, `Instrument`, `MarketStatus`,
  `IndexQuote`) and a single centralized market configuration from which the hierarchy, routes,
  capability flags, sitemap and robots rules are derived.
- Explicit `hasOptionChain` capability; INDIA VIX is chart/volatility only.
- Market navigator tree with roving-tabindex keyboard navigation.
- Index workspace: price, change, %, session status, last update, realtime indicator placeholder,
  TradingView Lightweight Charts candlestick panel with interval selector.
- Market overview table, loading skeletons, empty and error states, error boundary.
- Market data port with HTTP (backend contract) and Mock (development/test only) adapters,
  Zod-validated at the boundary.
- SEO: React 19 head hoisting, canonical/OG/Twitter metadata on public pages, `noindex` on
  private trading screens, build-time `sitemap.xml` and `robots.txt`.
- Unit and component tests (Vitest + Testing Library).
