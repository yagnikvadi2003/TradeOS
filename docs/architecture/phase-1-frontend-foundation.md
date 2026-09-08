# Phase 1 — Frontend foundation and market selector

## Goal

Ship the terminal shell, the Exchange → Category → Index navigation, the index workspace (price,
change, session status, chart) and the option-chain route placeholder — with production-quality
boundaries so later phases plug in realtime data without rework.

## Feature boundaries

```
src/
├── app/            shell: config (env, site), layouts, providers, router
├── features/
│   ├── market/     config (single source of truth), domain, hooks, components, pages
│   ├── charts/     candle domain, Lightweight Charts wrapper, chart panel
│   └── option-chain/  route placeholder (capability-gated)
├── components/     ui (shadcn-style primitives) · common (seo, states) · trading (atoms)
├── services/       api (typed client, schemas, market-data port + adapters) · websocket (states) · storage
├── stores/         zustand: connection status, UI preferences
├── utils/          format, market-status (pure)
└── tests/          setup, render helpers, library stubs
```

Rules: features import from `components/`, `services/`, `stores/`, `utils/`; features never import
from each other except via public `index.ts` barrels (`option-chain` reuses `market` components).

## Market configuration

`features/market/config/market.config.ts` declares exchanges, categories, instruments, indexes and
session schedules. `market.catalog.ts` builds Map-based lookups (O(1) by code, slug, instrument
key, route path) and the ordered tree. It asserts integrity at module load: unique codes/slugs,
every index references a known exchange/category/instrument, kinds agree, and a volatility index
can never declare `hasOptionChain: true`.

Everything else is derived from the catalog: navigator tree, overview table, ticker strip, route
resolution, prev/next shortcuts, sitemap and robots.

## Capability model

`MarketIndex.capabilities = { hasOptionChain, hasChart }`. `CapabilityActions` renders the Option
Chain action only when `hasOptionChain` is true. The option-chain route itself re-checks the flag
and shows an "unavailable" state for INDIA VIX even on a hand-typed URL.

## Routing and SEO

| Route                                            | Visibility | Notes                       |
| ------------------------------------------------ | ---------- | --------------------------- |
| `/markets`                                       | public     | overview, ItemList JSON-LD  |
| `/markets/:exchange/:category/:index`            | public     | canonical, OG, JSON-LD      |
| `/markets/:exchange/:category/:index/option-chain` | private  | `noindex,nofollow`, no canonical |

`components/common/seo.tsx` uses React 19 head hoisting (no head library). The Vite plugin in
`scripts/seo/` emits `sitemap.xml` and `robots.txt` at build time from the catalog and
`PRIVATE_PATH_PATTERNS`; the dev server serves the same content.

## Data layer

`services/api/market-data.client.ts` is the port. `HttpMarketDataClient` targets the v1 REST
contract (`/market/quotes`, `/charts/:key/candles`) with Zod validation. `MockMarketDataClient`
is a seeded random walk used only when `VITE_MARKET_DATA_SOURCE=mock` **and** not a production
build; quotes carry `source: 'simulated'` and the UI shows a warning badge.

TanStack Query is configured with no interval polling and no focus refetch. Realtime deltas will
patch the query cache from the WebSocket client in phase 4; components already subscribe to
per-instrument slices so ticks re-render only the affected cells (`PriceLevel` flashes on change).

## Market status

`utils/market-status.ts` evaluates the phase (PRE_OPEN / OPEN / CLOSED / POST_CLOSE) from the
session schedule with a fixed IST offset (no Intl parsing per tick). `useMarketStatus` re-runs at
the next scheduled transition or every 30 s, whichever is sooner. Holidays are not modelled; the
backend market-calendar module will become authoritative.

## Design

Cool graphite surfaces, one amber accent for selection/focus, semantic green/red reserved for
market direction, tabular figures everywhere numbers appear, 1 px rules instead of cards, small
radius. Motion is limited to state signals: price flash on change, pulsing dot for live/open.
Reduced-motion is respected. The navigator is a WAI-ARIA tree with roving tabindex; the mobile
navigator is a Radix dialog sheet with focus trapping.

## Tests

- catalog integrity and hierarchy derivation
- route builders and visibility
- market-status phase transitions (weekday, weekend, boundaries)
- number formatting (Indian grouping, signs, tick-derived precision)
- mock adapter determinism and invariants; HTTP client validation/errors
- navigator keyboard behaviour; capability actions per index
- route-level rendering: overview, index workspace, VIX chart-only, option-chain placeholder,
  VIX option-chain refusal, unknown path, quote error state, realtime indicator state
- chart wrapper lifecycle (single instance, `setData` on update, remove on unmount)

## Out of scope (later phases)

Backend, Upstox integration, WebSocket client, option-chain grid, authentication, holiday
calendar, Playwright E2E, Docker/observability.
