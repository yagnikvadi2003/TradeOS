# TradeOS

Indian market option-chain terminal. Current scope: six index instruments across NSE and BSE
(NIFTY 50, BANK NIFTY, FINNIFTY, INDIA VIX, SENSEX, BANKEX) with charts, session status and —
for the five equity indexes — an option chain. INDIA VIX is a volatility instrument and never
exposes an option chain.

## Status

| Phase | Scope                                                                     | State |
| ----- | ------------------------------------------------------------------------- | ----- |
| 1     | Frontend foundation, market navigation, index workspace, chart, SEO       | done  |
| 2     | Backend (NestJS), Prisma schema, option-chain domain + REST, AG Grid UI   | done  |
| 3     | Upstox adapter, Market Data Gateway, `/ws/market`, Redis layer, live grid | done  |
| 4     | Hardening: performance audit, security review, SEO, observability, deploy | done  |
| 5     | Users/auth module, session-issued stream tokens, live Upstox soak         | next  |

## Getting started

```bash
corepack enable && corepack prepare pnpm@10 --activate
pnpm install                              # also generates the Prisma client
pnpm --filter @tradeos/backend dev       # http://localhost:3000  (OpenAPI: /api/docs)
pnpm --filter @tradeos/frontend dev      # http://localhost:5173  (proxies /api and /ws → backend)
```

Realtime runs in single-instance mode by default (in-process state, bus and feed lease). With
`REDIS_URL` set, instances share state over Redis and exactly one of them holds the provider
connection. `MARKET_DATA_PROVIDER=upstox` needs either `UPSTOX_ACCESS_TOKEN` or the OAuth app
credentials plus the operator endpoints under `/api/v1/providers/upstox/auth/*`; see
`.env.example`. The browser connects only to `/ws/market` on this backend — never to Upstox.

The backend runs without PostgreSQL in development (in-memory metadata repository) and with the
deterministic mock provider (`MARKET_DATA_PROVIDER=mock`, refused in production). With a database:

```bash
cp .env.example .env                     # set DATABASE_URL
pnpm --filter @tradeos/backend prisma:migrate   # apply migrations
pnpm --filter @tradeos/backend prisma:seed      # six-index catalog
```

The frontend defaults to `VITE_MARKET_DATA_SOURCE=mock` (see `frontend/.env.development`): a
deterministic, clearly labelled _Simulated_ adapter so the terminal renders standalone. Set it to
`http` to use the backend REST contract; production builds always do.

## Quality gate

````bash
pnpm verify      # typecheck → lint → test → build (both workspaces)
pnpm test:e2e    # Playwright against the production build + mock backend
pnpm audit       # dependency vulnerabilities (fails on high)
```s

```bash
pnpm verify   # typecheck → lint → test → build, across workspaces
````

## Layout

```
tradeos/
├── frontend/   React 19 · Vite · Tailwind v4 · shadcn/ui · React Router 7 · TanStack Query · Zustand · AG Grid
├── backend/    NestJS 11 · Prisma 7 (PostgreSQL) · Zod · Pino · Helmet · Swagger · Vitest/Supertest
├── docs/       architecture notes per phase
└── .github/    CI
```

See `docs/architecture/` for the per-phase design notes (`phase-1-frontend-foundation.md`,
`phase-2-option-chain.md`, `phase-3-realtime.md`, `phase-4-hardening.md`), plus
`docs/deployment.md`, `docs/security.md` and `docs/api.md`.

## Security

Provider credentials (Upstox tokens, secrets) never reach the browser. See `SECURITY.md`.
