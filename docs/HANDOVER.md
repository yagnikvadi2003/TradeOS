# TradeOS — Project Handover & Continuation Guide

> Read this first when resuming work. It records what exists, how it is verified, the
> conventions every change must follow, and the ordered backlog. Written 2026-09-12 at v0.7.0.

## 1. What TradeOS is

A professional Indian-market trading terminal (not a SaaS dashboard) for six indexes:

```
NSE: NIFTY 50 · BANK NIFTY · FINNIFTY (option chain)  ·  INDIA VIX (volatility, NO option chain)
BSE: SENSEX · BANKEX (option chain)
```

Market data comes from **Upstox** (official APIs only), through a **backend gateway**; the
browser never talks to Upstox and never polls for live data. REST = snapshots/metadata/history/
user data; WebSocket `/ws/market` = live updates.

## 2. Repository map (pnpm monorepo)

```
tradeos/
├── frontend/   React 19 · Vite · TypeScript · React Router 7 · TanStack Query · Zustand ·
│               AG Grid 36 · TradingView Lightweight Charts · Tailwind v4 + shadcn primitives ·
│               Vitest + RTL · Playwright (e2e/)
├── backend/    NestJS 11 · Prisma 7 (PostgreSQL, pg adapter) · Zod · nestjs-pino · Helmet ·
│               throttler · ws · protobufjs · ioredis (optional) · @sentry/node · Vitest/Supertest
├── docs/       api.md · websocket-protocol.md · deployment.md · security.md · openapi.json ·
│               adr/0001–0008 · architecture/phase-1…phase-6 · HANDOVER.md (this file)
├── infrastructure/  docker (Dockerfiles, Caddyfile, compose + compose.dev) · prometheus · grafana
├── .github/workflows/  backend-ci.yml · frontend-ci.yml
└── .env.example      every variable, documented
```

Backend `src/`: `app/` (bootstrap, `configure-app.ts` incl. OpenAPI builder) · `common/`
(env, errors, market primitives, openapi helpers, realtime auth + WS contract, validation) ·
`infrastructure/` (database, cache, redis, realtime primitives, logging, health/metrics,
observability) · `modules/` (instruments, market, charts, option-chain, market-stream,
session, user-data, watchlists, alerts, notifications, preferences, market-calendar) ·
`providers/` (`provider.interface.ts`, `feed-provider.interface.ts`, `mock/`, `upstox/{auth,rest,
websocket,mappers,types}`).

Frontend `src/`: `app/` (router, providers, seo, observability) · `features/` (market,
option-chain, charts, watchlists, alerts, notifications) · `services/api` (HTTP + mock clients,
Zod schemas, simulator) · `services/websocket` (WsMarketStream + mock twin) · `stores/`
(connection, market-state, market-ui, option-chain, notifications) · `hooks/` · `components/`
(ui, common, trading) · `lib/strings.ts` (all UI copy) · `styles/globals.css` (design tokens).

## 3. How to run and verify

```bash
corepack enable && pnpm install          # generates the Prisma client (backend postinstall)
pnpm verify                              # typecheck → lint → test → build, both workspaces
pnpm --filter @tradeos/backend dev       # :3000 · Swagger /api/docs · /health · /metrics
pnpm --filter @tradeos/frontend dev      # :5173 · proxies /api and /ws to :3000
pnpm test:e2e                            # builds both, runs Playwright (needs `playwright install chromium`)
pnpm infra:dev                           # optional local PostgreSQL + Redis (docker compose)
pnpm --filter @tradeos/backend openapi:export   # regenerates docs/openapi.json from the build
pnpm --filter @tradeos/backend bench:fanout     # router throughput check
```

Defaults without any `.env`: `MARKET_DATA_PROVIDER=mock` (deterministic simulated data, tagged
`simulated`, **refused in production**), in-memory metadata/user-data repositories, single-instance
realtime (no Redis). Frontend `.env.development` uses `VITE_MARKET_DATA_SOURCE=mock`; set `http`
to go through the backend. For real data: `MARKET_DATA_PROVIDER=upstox` + `UPSTOX_ACCESS_TOKEN`
(Upstox Analytics Token, read-only, 1 year) or the OAuth operator flow (`/api/v1/providers/upstox/auth/*`).

Last verified state (2026-09-12): backend 29 test files / 129 tests, frontend 24 / 96, lint,
format and builds clean, `pnpm audit --audit-level=high` clean (4 dev-only moderates remain).

## 4. What has been built, by phase (all in CHANGELOG.md)

| Version | Delivered                                                                                                                                                                                                                                                     |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1.0   | Frontend foundation: catalog, market tree (Exchange → Category → Index), index workspace, chart panel, SEO, design tokens, mock data adapter                                                                                                                  |
| 0.2.0   | Backend: NestJS, Prisma schema (instruments/expiries/option contracts), option-chain domain + REST, deterministic mock provider, AG Grid chain with transaction-based updates                                                                                 |
| 0.3.0   | Upstox adapter (OAuth, AES-GCM credential store, REST, V3 protobuf feed with state machine/backoff/stale watchdog), Market Data Gateway (registry, refcounts, coalescing router, backpressure), `/ws/market`, Redis twins with in-process fallback, live grid |
| 0.4.0   | Hardening: single-encode fanout, render isolation, demand TTL, Sentry scrubbing, Prometheus exporter, OAuth state binding, SSRF host pinning, Docker/Caddy/compose, Playwright suite, sitemap/robots                                                          |
| 0.5.0   | Foundation: Zod→OpenAPI (all endpoints), request/correlation IDs, DB + event-loop metrics, health with provider/WS states, layered dotenv, CI with permissions/audit/Docker/E2E jobs, WS protocol doc, 8 ADRs                                                 |
| 0.6.0   | Charts backend (Upstox V3 historical + intraday candles), `/instruments`, derived option analytics (PCR, max pain, ATM IV, concentrations, S/R, spread), provider simulator fault modes, feed sharding, fanout 35k→78k updates/s                              |
| 0.7.0   | Device sessions (cookie + CSRF), watchlists, alerts engine on the gateway, notifications (REST + WS frame), preferences, market calendar backend, chart overlays + indicator library, production audit                                                        |

## 5. Conventions every change must keep

1. **Provider isolation** — Upstox types never leave `providers/upstox`; the domain sees
   `MarketDataProvider` / `MarketFeedProvider` ports and TradeOS keys
   (`NSE:INDEX:NIFTY50`, `NSE:OPT:NIFTY50:2026-09-15:24000:CE`).
2. **Zod at every boundary** — REST params/body, WS frames, provider payloads (twice), env.
   Response schemas double as OpenAPI via `common/openapi/zod-openapi.ts` (`ApiZodResponse`,
   `ApiZodQuery`, `ApiZodBody`, `ApiStandardErrors`). New endpoint ⇒ documented by construction.
3. **No polling, no tick persistence** — live data only via `/ws/market`; PostgreSQL holds
   metadata and user data only. Any cache defines key/TTL/invalidation/failure behaviour.
4. **Bounded everything** — queues, maps, histograms, notifications, pending states; every
   lifecycle has cleanup (module destroy, effect cleanup, `unref`'d timers).
5. **Render isolation** — per-key Zustand selectors; the grid subscribes outside React and
   applies row transactions; page components must not re-render per tick.
6. **Derived vs provider facts** — analytics/alerts carry `derived: true` / are labelled
   "Derived" in the UI. Never present a calculation as exchange data.
7. **Errors** — one envelope `{ error: { code, message, details? } }`; `DomainError` codes map
   to HTTP in `common/errors/domain-error.ts`.
8. **Secrets** — env only; redacted in logs and Sentry; never in responses or the bundle.
9. **Mock ≠ live** — mock provider/stream/client are for dev/tests, tagged `simulated`,
   refused in production; the frontend simulator mirrors backend shapes exactly.
10. **UI** — terminal density, tokens from `globals.css`, copy in `lib/strings.ts`, no
    decorative animation, keyboard paths for every action.
11. **Migrations** — hand-authored SQL under `backend/prisma/migrations`, validated in CI by
    `migrate deploy` + `migrate diff --exit-code`; never edit production schema by hand.
12. **Gate before "done"** — `pnpm verify` + `format:check` green, docs/CHANGELOG/version bumped.

## 6. Backlog (ordered) — start here next time

1. **Live Upstox soak** — run `MARKET_DATA_PROVIDER=upstox` in market hours; watch `/metrics`:
   `market_data_invalid_total` must stay 0, `market_data_staleness_seconds` < 15. Confirm
   candle response keying, contract tick-size units (paise assumption), OHLC quote keys.
2. **Run the unexecuted jobs** — `pnpm test:e2e` with Chromium installed; the Docker build job;
   `prisma migrate dev` once against a real PostgreSQL to confirm the three hand-written migrations.
3. **Futures** — verify the Upstox futures contract endpoint, then `modules/futures` (contract,
   expiry, LTP/OI/ΔOI, basis) behind the same ports; keep INDIA VIX excluded.
4. **Server-authoritative market status in the UI** — `useMarketCalendar` hook consuming
   `/market-calendar`, keep the pure evaluator as fallback; operator seeding of holidays.
5. **Chart panes** — RSI/MACD/ATR sub-panes (indicators already computed in `features/charts/indicators.ts`).
6. **User accounts** (ADR-0008 step 2) — registration/login/refresh/reset/verification issuing the
   same session cookie + stream tokens; attach existing anonymous sessions on first login.
7. **Alerts v2** — live ΔOI/PCR re-evaluation from the stream instead of the 60 s snapshot,
   per-session mutation rate limits, alert history view.
8. **Deploy** — pick the VPS per `docs/deployment.md` (no free always-on WS host exists in 2026),
   add a deploy stage + smoke test to CI, Grafana dashboard check against live metrics.
9. **Nice-to-have** — comparison overlays on charts, watchlist drag-and-drop, sound notifications,
   real-PostgreSQL integration tests in CI, correlation-ID propagation into provider calls.

## 7. Known limitations (honest list)

- The Upstox runtime path is documentation-verified and test-covered with a scripted transport, **never run against the live feed**.
- Playwright E2E and the Docker CI job are written but were not executed in the authoring sandbox.
- Sessions are anonymous device sessions; there are no user accounts yet.
- Market calendar has no holiday rows until an operator loads them from the exchange circulars (nothing is guessed).
- Futures are not implemented.
- Lot sizes / strike steps in the catalog are reference seeds; the provider instrument master is authoritative once synced.

## 8. Where to look when something breaks

| Symptom                            | Look at                                                                                                             |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Chain/header shows "Simulated"     | `MARKET_DATA_PROVIDER` / `VITE_MARKET_DATA_SOURCE` are still `mock`                                                 |
| Provider `RECONNECTING` forever    | `/health` → provider; logs `feed: connect failed` (auth=true ⇒ token expired/missing)                               |
| `market_data_invalid_total` rising | provider contract drift: `providers/upstox/mappers/upstox-feed.normalizer.ts`, `rest/upstox-rest.client.ts` schemas |
| Clients see no deltas              | registry refcounts (`/metrics` `market_ws_subscribed_keys`), feed shard cap (`UPSTOX_MAX_SUBSCRIPTIONS`)            |
| 401 on watchlists/alerts           | missing `GET /session` first, or mutation without `X-Requested-With: TradeOS`                                       |
| Redis warnings                     | expected without Redis; single-instance mode is supported                                                           |
