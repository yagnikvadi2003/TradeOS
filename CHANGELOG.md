# Changelog

All notable changes to TradeOS are documented here. The format follows Keep a Changelog.

## [0.2.0] — Phase 2

### Added

- `backend/` workspace: NestJS 11, Zod-validated environment, URL-versioned REST (`/api/v1`),
  Helmet, strict CORS, rate limiting, structured Pino logging with credential redaction, single
  error contract, OpenAPI at `/api/docs`, `/health`, `/health/live`, `/health/ready`.
- Prisma 7 schema and initial migration: `instruments`, `expiries`, `option_instruments`,
  `provider_instrument_mappings` with unique constraints, cascading foreign keys and indexes.
  No realtime ticks are stored. Idempotent seed for the six-index catalog.
- Provider-independent `MarketDataProvider` port with boundary re-validation, and a deterministic
  mock adapter (expiry calendars, strike ladders, Black–Scholes-consistent quotes, Greeks) that is
  refused in production.
- Option-chain module: repository port (Prisma + in-memory), service with metadata TTL, in-flight
  coalescing and 2 s snapshot cache, assembler (ATM, steps-from-ATM, intrinsic/extrinsic, totals,
  PCR), v1 DTOs/mappers, `GET /option-chain/:instrument`, `/expiries`, `/snapshot`.
- Frontend option-chain screen: expiry selector (radiogroup, keyboard), toolbar (strike window,
  column preset, refresh), ATM indicator, market status, data-freshness and connection-status
  signals, and an AG Grid configured for high-frequency data (stable row ids, diffed transactions,
  cell change flash, memoised columns, lazily loaded chunk).
- Normalized frontend option-chain types and Zod-validated v1 HTTP client; mock client twin.
- Backend CI workflow that applies the migration to PostgreSQL and checks schema drift.
- Tests across service, DTO validation, repositories, API (Supertest), grid transaction contract,
  expiry selector, rows/diff, store, and route rendering.

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
