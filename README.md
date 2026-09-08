# TradeOS

Indian market option-chain terminal. Current scope: six index instruments across NSE and BSE
(NIFTY 50, BANK NIFTY, FINNIFTY, INDIA VIX, SENSEX, BANKEX) with charts, session status and —
for the five equity indexes — an option chain. INDIA VIX is a volatility instrument and never
exposes an option chain.

## Status

| Phase | Scope                                                                  | State |
| ----- | ---------------------------------------------------------------------- | ----- |
| 1     | Frontend foundation, market navigation, index workspace, chart, SEO     | done  |
| 2     | Backend (NestJS), Prisma, Redis/in-memory cache, REST snapshots         | next  |
| 3     | Provider abstraction + Upstox adapter (OAuth, REST, feed WebSocket)     |       |
| 4     | Market Data Gateway + application WebSocket                              |       |
| 5     | Option-chain grid (AG Grid), realtime wiring                             |       |

## Getting started

```bash
corepack enable && corepack prepare pnpm@10 --activate
pnpm install
pnpm --filter @tradeos/frontend dev      # http://localhost:5173
```

Development runs with `VITE_MARKET_DATA_SOURCE=mock` (see `frontend/.env.development`): a
deterministic, clearly labelled *Simulated* data adapter so the terminal renders before the backend
exists. Production builds ignore the mock setting and always use the backend REST contract.

## Quality gates

```bash
pnpm verify   # typecheck → lint → test → build, across workspaces
```

## Layout

```
tradeos/
├── frontend/   React 19 · Vite · Tailwind v4 · shadcn/ui · React Router 7 · TanStack Query · Zustand
├── backend/    (phase 2)
├── docs/       architecture notes per phase
└── .github/    CI
```

See `docs/architecture/phase-1-frontend-foundation.md` for the frontend design and boundaries.

## Security

Provider credentials (Upstox tokens, secrets) never reach the browser. See `SECURITY.md`.
