# TradeOS

Indian market option-chain terminal. Current scope: six index instruments across NSE and BSE
(NIFTY 50, BANK NIFTY, FINNIFTY, INDIA VIX, SENSEX, BANKEX) with charts, session status and —
for the five equity indexes — an option chain. INDIA VIX is a volatility instrument and never
exposes an option chain.

## Status

| Phase | Scope                                                                   | State |
| ----- | ----------------------------------------------------------------------- | ----- |
| 1     | Frontend foundation, market navigation, index workspace, chart, SEO     | done  |
| 2     | Backend (NestJS), Prisma schema, option-chain domain + REST, AG Grid UI | done  |
| 3     | Upstox adapter (OAuth, REST, feed WebSocket)                            | next  |
| 4     | Market Data Gateway + application WebSocket, Redis state layer          |       |
| 5     | Realtime wiring into the grid, E2E, deployment                          |       |

## Getting started

```bash
corepack enable && corepack prepare pnpm@10 --activate
pnpm install                              # also generates the Prisma client
pnpm --filter @tradeos/backend dev       # http://localhost:3000  (OpenAPI: /api/docs)
pnpm --filter @tradeos/frontend dev      # http://localhost:5173  (proxies /api → backend)
```

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

## Quality gates

```bash
pnpm verify   # typecheck → lint → test → build, across workspaces
```

## Layout

```
tradeos/
├── frontend/   React 19 · Vite · Tailwind v4 · shadcn/ui · React Router 7 · TanStack Query · Zustand · AG Grid
├── backend/    NestJS 11 · Prisma 7 (PostgreSQL) · Zod · Pino · Helmet · Swagger · Vitest/Supertest
├── docs/       architecture notes per phase
└── .github/    CI
```

See `docs/architecture/` for the per-phase design notes (`phase-1-frontend-foundation.md`,
`phase-2-option-chain.md`).

## Security

Provider credentials (Upstox tokens, secrets) never reach the browser. See `SECURITY.md`.
