# Phase 2 — Option-chain domain, API, schema and terminal grid

## Goal

Ship the backend foundation (NestJS, Prisma, provider port) and the option-chain domain end to
end: metadata and snapshot REST contracts, PostgreSQL schema for durable metadata, a
deterministic mock provider, and the option-chain screen with an AG Grid prepared for
high-frequency targeted updates. **No continuous streaming yet** — the application WebSocket and
the Upstox feed arrive in later phases.

## Backend layout

```
backend/src/
├── main.ts · app/                bootstrap, configureApp (versioning, Helmet, CORS, Swagger)
├── common/
│   ├── config/                   Zod-validated env (`APP_ENV` token)
│   ├── errors/                   DomainError vocabulary → single `{ error: { code, message } }` body
│   ├── market/                   instrument/contract key builders + parsers, IST date helpers
│   └── validation/               ZodValidationPipe (params, query, body)
├── modules/
│   ├── instruments/              six-index catalog (seed source, capability gating)
│   └── option-chain/             controller · service · repository port · assembler · DTOs · mappers
├── providers/
│   ├── provider.interface.ts     MarketDataProvider port (domain types in/out)
│   ├── provider.schemas.ts       Zod schemas re-validating every adapter result
│   └── mock/                     deterministic simulated adapter (dev/test only)
└── infrastructure/
    ├── database/                 Prisma 7 client via pg driver adapter; `PRISMA` is null without DATABASE_URL
    ├── cache/                    CacheStore port + in-memory TTL store (Redis implementation later)
    ├── logging/                  nestjs-pino, slim serializers, credential redaction
    └── health/                   /health, /health/live, /health/ready
```

### Data layers

```
Provider adapter (mock | upstox)
    ↓ domain-shaped result, re-validated with provider.schemas
OptionChainService
    ↓ metadata: repository first, provider on miss / TTL, then persisted
    ↓ market data: provider per request, coalesced in-flight, cached 2 s
OptionChainAssembler
    ↓ ATM = strike nearest the underlying LTP on the instrument's strike step
    ↓ stepsFromAtm, intrinsic/extrinsic, per-side OI/volume totals, PCR
Mapper → v1 DTOs (Zod schemas double as OpenAPI + frontend validation)
```

The service never sees a provider payload; the controller never sees a domain object. Upstox
symbols will live only in `ProviderInstrumentMapping` and inside the adapter.

### REST (v1)

| Route                                           | Cache-Control         | Notes                                                  |
| ----------------------------------------------- | --------------------- | ------------------------------------------------------ |
| `GET /api/v1/option-chain/:instrument`          | `private, max-age=60` | lot size, strike step, expiries, nearest expiry        |
| `GET /api/v1/option-chain/:instrument/expiries` | `private, max-age=60` | listed expiries with cycle and days-to-expiry          |
| `GET /api/v1/option-chain/:instrument/snapshot` | `no-store`            | `?expiry=YYYY-MM-DD`; nearest listed expiry if omitted |

`:instrument` is a TradeOS key (`NSE:INDEX:NIFTY50`, URL-encoded). Errors: `VALIDATION_FAILED`
(400), `INSTRUMENT_NOT_FOUND` / `OPTION_CHAIN_NOT_SUPPORTED` / `EXPIRY_NOT_FOUND` (404),
`PROVIDER_PAYLOAD_INVALID` (502), `PROVIDER_UNAVAILABLE` (503). INDIA VIX returns
`OPTION_CHAIN_NOT_SUPPORTED` before any provider call. OpenAPI UI at `/api/docs` outside
production.

### Free-deployment behaviour

- Snapshot requests for the same (instrument, expiry) share one in-flight provider call and one
  2 s cache entry, so a burst of clients costs one provider round-trip.
- Expiries and contracts are read from PostgreSQL and only re-validated with the provider every
  `OPTION_METADATA_TTL_SECONDS` (default 15 min).
- No tick is ever written to PostgreSQL. Without `DATABASE_URL` in development the repository is
  in-memory; readiness reports `database: disabled` rather than failing.
- Request logs carry method/url/status only; nothing else is serialized.

## Database

Prisma 7 with the `prisma-client` generator (output `src/generated/prisma`, regenerated on
install) and the `pg` driver adapter. Tables: `instruments`, `expiries`, `option_instruments`,
`provider_instrument_mappings`. Uniques: `instrumentKey`, `(exchangeCode, symbol)`,
`(instrumentId, expiryDate)`, `contractKey`, `(expiryId, strike, optionType)`,
`(provider, providerSymbol)`. Cascading FKs from underlying → expiry → contract.

Migration `20260909000000_init` was authored in Prisma's Postgres DDL conventions because the
sandbox that produced it could not download the Prisma schema engine. **CI applies it to a fresh
PostgreSQL and runs `prisma migrate diff --exit-code` against the schema**, so any drift fails the
build. Never edit the production schema outside a migration.

## Mock provider

`MockMarketDataProvider` is a pure function of (instrument, expiry, 2 s time bucket): seeded PRNG,
exchange-style expiry calendars (weekly Tuesdays for NIFTY 50, monthly last Tuesday for BANK
NIFTY / FINNIFTY, weekly Thursdays for SENSEX, monthly last Thursday for BANKEX), 81 strikes ×
CE/PE per expiry on the instrument step, Black–Scholes-consistent LTP / IV smile / Greeks, bid–ask
that widens away from ATM, OI and volume that decay with distance. Everything carries
`source: 'simulated'`; `loadEnv` refuses `MARKET_DATA_PROVIDER=mock` in production.

## Frontend

```
features/option-chain/
├── domain/      types (OptionContract, OptionStrike, OptionChainSnapshot, OptionChainRow,
│                OptionMarketData, Expiry, UnderlyingMarketData), rows (snapshotToRows,
│                windowRows, diffRows), freshness, active-expiry
├── hooks/       useOptionChainMetadata (5 min stale), useOptionChainSnapshot (no polling)
├── components/  ExpirySelector · OptionChainToolbar · ATMIndicator · MarketStatus ·
│                DataFreshnessIndicator · ConnectionStatus
├── grid/        column-defs (CE ← strike → PE mirror) · theme · register-modules · OptionChainGrid
└── pages/       OptionChainPage (capability-gated; VIX never issues a request)
```

The market-data port gained `getOptionChainMetadata / Expiries / Snapshot`; the HTTP adapter
validates v1 responses with Zod, the mock adapter reuses a frontend twin of the backend simulator.

### Grid update contract

- `getRowId` is the strike, so a row's identity survives every snapshot.
- Each new snapshot is turned into rows and **diffed** against the rows the grid already holds;
  rows whose visible values did not change are skipped, the rest go through
  `applyTransactionAsync` (batched at 40 ms). `setGridOption('rowData')` runs only when the
  instrument, expiry or strike window changes.
- Changed cells flash via AG Grid's change-highlight (no React re-render); the component is
  memoised and receives stable references.
- Only the modules the chain needs are registered; the grid is its own lazily loaded chunk.
- Zustand holds UI state only (selected expiry per instrument, strike window, column preset);
  market data lives in the TanStack Query cache, which the realtime gateway will patch in phase 4.

### Toolbar signals

ATM reference (strike, distance, PCR), session status, data freshness (fresh < 5 s, aging < 30 s,
stale), and the realtime link (`Snapshot mode` until the gateway exists). A `Refresh` action
re-requests the snapshot explicitly — there is no interval.

## Tests

Backend: env, validation pipe, catalog, mock provider (calendars, determinism, schema
conformance, pricing sanity), assembler (ATM, moneyness, totals), service (metadata reuse,
provider fallback, snapshot coalescing, VIX refusal, provider failure, invalid payload), in-memory
and Prisma repositories (stubbed client), DTO schemas, Supertest API tests (200/400/404/503
paths). Frontend: rows/diff/window, freshness and active-expiry resolution, store, mock and HTTP
clients, expiry selector keyboard, grid transaction contract (stubbed AG Grid), route-level
rendering incl. expiry switching and VIX refusal.

## Out of scope (next phases)

Upstox adapter (OAuth, REST, feed), Market Data Gateway and application WebSocket, Redis cache
store, authentication, Playwright E2E, Docker/observability stack.
