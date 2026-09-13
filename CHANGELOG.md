# Changelog

All notable changes to TradeOS are documented here. The format follows Keep a Changelog.

## [0.7.0] — Product features + production audit

### Added

- Device sessions (`GET/DELETE /api/v1/session`): HttpOnly SameSite cookie, HMAC-signed id, sliding
  30-day expiry, CSRF via required `X-Requested-With` header; session-bound stream tokens.
- Watchlists (`/api/v1/watchlists`), alerts (`/api/v1/alerts`, 10 conditions, server-evaluated
  through the gateway with reference-counted subscriptions), notifications (`/api/v1/notifications`
  - live `notification` WebSocket frame), preferences (`/api/v1/preferences`), market calendar
    (`/api/v1/market-calendar`, operator-loaded holidays). Prisma models + migration
    `20260912000000_sessions_watchlists_alerts`; in-memory repository without a database.
- Frontend: watchlist panel on the overview (live rows, keyboard reorder), alerts panel on index
  pages, notifications tray with unread badge and browser-notification opt-in, chart overlays
  (SMA 20, EMA 50, Bollinger 20) backed by a tested indicator library (SMA/EMA/RSI/MACD/BB/ATR/VWAP).
- `docs/architecture/phase-6-product-and-audit.md`: the ten audits, verification evidence,
  deployment research and the production-readiness score.

### Not implemented (documented)

- Futures (Upstox endpoint not verified this phase); RSI/MACD/ATR chart panes.

## [0.6.0] — Market data, option analytics, realtime hardening

### Added

- `GET /api/v1/charts/:instrument/candles` — historical OHLC (1m/5m/15m/1h/1d) with per-bar caching
  and in-flight coalescing; Upstox V3 historical + intraday candle APIs (doc-verified) merged and
  de-duplicated; deterministic simulator bars. Fixes the chart panel in `http` mode.
- `GET /api/v1/instruments` — supported instruments with capability flags (INDIA VIX: no option chain).
- Option analytics, server-side and tagged `derived: true`: OI PCR, volume PCR, max pain, ATM IV,
  OI/ΔOI/volume concentration, support/resistance candidates; per-leg bid–ask `spread`. Frontend
  analytics strip labelled "Derived"; simulator twin keeps mock snapshots shape-identical.
- Provider simulator fault modes on the mock feed: malformed payload, duplicate frame, stale data,
  delayed data, burst, silence (DEGRADED), heartbeat timeout, disconnect/reconnect — with a
  scenario test suite pinning the pipeline's behaviour for each.
- `ShardedMarketFeedProvider`: deliberate sharding of upstream subscriptions across the permitted
  Upstox connections (`UPSTOX_FEED_CONNECTIONS`, 1–2), first-fit by capacity, worst-shard state
  surfaced so a dead socket is never masked.
- `pnpm --filter @tradeos/backend bench:fanout` throughput check for the router.

### Changed

- Market state store treats an exact replay (same exchange time, same values) as a duplicate frame:
  no re-fanout.
- `connection_status.stale` is true for every non-CONNECTED provider state.
- Coalescing queue overwrites in place (one Map op instead of delete+set): router throughput
  35k → 78k updates/s at 200 clients × 300 keys on the benchmark host.

## [0.5.0] — Engineering foundation

### Added

- OpenAPI: Zod→OpenAPI bridge (`common/openapi`, Zod 4 native JSON Schema, no dependency); every
  REST endpoint documented with response schemas, the shared error envelope, examples, tags and
  the `operator-key` security scheme; `pnpm --filter @tradeos/backend openapi:export` writes
  `docs/openapi.json` (CI artifact). Swagger is now environment-configurable (`SWAGGER_ENABLED`,
  default on outside production).
- Request/correlation IDs: inbound `X-Request-Id` honoured when well-formed, always echoed; optional
  `X-Correlation-Id` propagated; service/version/env base fields on every log line.
- Health: `/health` reports coarse states for database, redis, provider and websocket plus version —
  no operational internals; readiness still gates on required infrastructure only.
- Metrics: `db_query_duration_seconds`, `db_errors_total` (Prisma query events), `nodejs_eventloop_lag_ms`.
- Sentry: 5xx exceptions are now captured by the global filter when the SDK is initialised.
- Environment separation: layered `.env.<NODE_ENV>.local → .env.local → .env.<NODE_ENV> → .env`, never
  overriding the real environment.
- Test scripts `test:unit` / `test:integration` / `test:coverage`; `prisma:studio` / `prisma:validate`;
  root `dev`, `format`, `format:check`, `infra:dev` (`docker-compose.dev.yml` with PostgreSQL + Redis).
- CI: least-privilege `permissions`, concurrency groups, format check, unit/integration split,
  OpenAPI artifact, dependency audit job, Docker image build job, Playwright E2E job.
- `docs/websocket-protocol.md` (standalone versioned protocol) and eight ADRs under `docs/adr/`.

### Changed

- Upstox feed files relocated into `providers/upstox/{websocket,mappers,types}` (imports only);
  empty `modules/realtime` and `modules/market/domain` directories removed.
- `@sentry/react` moved to runtime dependencies; `prom-client` removed (never imported).

## [0.4.0] — Phase 4

### Added

- `GET /api/v1/market/quotes` (live state → 2 s cache → provider) as the REST seed for index headers.
- Prometheus exporter with the agreed metric names (`market_provider_connection`,
  `market_provider_reconnect_total`, `market_data_invalid_total`, `market_data_dropped_total`,
  `market_ws_clients`, `market_ws_latency_ms`, `market_data_staleness_seconds`, `redis_available`,
  `redis_latency_ms`, `http_request_duration_seconds`, `http_errors_total`, `process_*`), an HTTP
  metrics interceptor, Prometheus scrape/alert rules and a Grafana dashboard under `infrastructure/`.
- Sentry for backend and frontend, disabled without a DSN and scrubbed of tokens, headers,
  cookies, OAuth query values and user objects.
- Docker images (backend, Caddy-served frontend), Caddyfile with CSP/security headers,
  docker-compose with optional Redis; `docs/deployment.md`, `docs/security.md`, `docs/api.md`.
- `robots.txt` and `sitemap.xml` generated at build from the route catalog (option-chain screens
  excluded and disallowed).
- Playwright E2E suite (`pnpm test:e2e`): market tree, option-chain capabilities incl. INDIA VIX
  exclusion, no-polling assertion, WebSocket drop → reconnect.
- `TRUST_PROXY`, `DATABASE_POOL_MAX`, `HTTP_REQUEST_LOGGING`, `SENTRY_*` settings.

### Changed

- Delta frames are serialized once per update per flush (not once per subscriber).
- Option-chain page no longer re-renders per tick; the grid patches only rows touched by each batch.
- WebSocket client coalesces subscribe/unsubscribe deltas per task and reuses session tokens.
- Leader expires demand from silent follower instances (90 s) so upstream subscriptions cannot leak.
- OAuth callback authorized by a single-use `state`; Upstox host pinned to `https://*.upstox.com`.
- Logs redact `x-operator-key` and `code`/`state`/`token` query values; success request lines are
  off by default in production. Graceful `SIGTERM`/`SIGINT` shutdown with a 10 s deadline.
- Redis health reports `fail` when configured but unreachable (previously `disabled`).

### Security

- `pnpm audit --audit-level=high` clean via overrides for `multer`, `deepmerge-ts`, `mysql2`.

## [0.3.0] — Phase 3

### Added

- Upstox adapter: Market Data Feed V3 client (protobuf decode, binary-JSON subscribe frames,
  connection state machine, exponential backoff with jitter, connect timeout, stale watchdog,
  heartbeat-timeout reconnect, automatic resubscription, batched upstream subscriptions capped at
  the documented limit), REST client for option contracts / chain / OHLC, OAuth 2.0 code
  exchange with AES-256-GCM credential storage (`provider_credentials` migration) and
  operator-key-guarded endpoints, snapshot provider that reads live state first.
- Market Data Gateway: `SubscriptionRegistry` (reference counting), `MarketStreamService`
  (cross-instance demand, feed lease, boundary validation), `MarketDataRouter` (per-client
  coalescing queues, flush cadence, backpressure hold, bounded drops), `MarketStreamGateway` at
  `/ws/market` (origin allow-list, connection caps, auth-first, Zod-validated discriminated-union
  messages, per-key authorization and scope, subscription cap, rate limit, payload cap, server
  heartbeat). `GET /api/v1/realtime/token` issues HS256 session tokens.
- Redis layer behind the same ports: pub/sub bus, coalesced hash-mirrored state store with
  boot hydration, `SET NX PX` feed lease; in-process implementations for single-instance mode
  and graceful degradation when Redis is unreachable.
- Observability: realtime snapshot in `/health`, Prometheus text at `/metrics`.
- Frontend: `WsMarketStream` (native WebSocket, refcounted subscriptions, reconnect, heartbeat,
  validation) with a mock twin, market-state store with per-key selectors, live overlay of ticks
  into the option-chain grid via animation-frame-throttled transactions, live index header,
  real connection/provider status. Vite dev proxy for `/ws`.
- Tests: 96 backend (unit, integration, WebSocket) and 84 frontend.

### Changed

- Realtime connection states gained `degraded`; the header indicator reflects the live link.
- Backend `CoalescingQueue` exposes counter resets for accurate drop reporting.

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
