# Phase 4 — Production hardening

Scope: the six-index Indian market module and its option chain. No new product features.

## Performance audit — Upstox → backend → Redis → WebSocket → browser → Zustand → AG Grid → chart

| Hop               | Finding                                                                                                                                                                               | Action                                                                                                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Upstox → adapter  | Frames decoded/validated once; one upstream socket per fleet; batched `sub`/`unsub`.                                                                                                  | Kept. Added `touchProviderFrame` → `market_data_staleness_seconds`.                                                                                                         |
| Adapter → service | Updates validated a second time at the domain boundary (cheap, catches adapter bugs).                                                                                                 | Kept.                                                                                                                                                                       |
| Service → Redis   | State mirrored by coalesced `HSET` pipeline every 250 ms; one `PUBLISH` per batch; lease renewal every 5 s. No per-tick writes.                                                       | Kept.                                                                                                                                                                       |
| Fleet demand      | A follower instance that died kept its demand on the leader forever → leaked upstream subscriptions.                                                                                  | Followers re-announce every 30 s; leader expires silent instances after 90 s (`expiredRemoteInstances`).                                                                    |
| Router → sockets  | Each delta frame was `JSON.stringify`-ed **per subscriber**: 100 clients on NIFTY 50 = 100 encodes of the same update.                                                                | Encode once per update per flush; frames are string-assembled and sent raw (`RouterClient.sendRaw`).                                                                        |
| REST seed         | Index pages called `/market/quotes`, which did not exist → 404 + TanStack retries on every visit.                                                                                     | Implemented with live-state → 2 s cache → provider tiers and in-flight coalescing.                                                                                          |
| Browser WS client | Every reconnect fetched a new session token; a strike-window change sent `unsubscribe`+`subscribe` for shared keys (upstream flap, server snapshot resend).                           | Token reused until 60 s before expiry; subscription deltas coalesced per task so shared keys cancel out (tested).                                                           |
| Zustand → React   | `OptionChainPage` subscribed to the underlying tick and the newest-timestamp selector → the whole page (toolbar, selector) re-rendered per delta frame.                               | Header moved into `LiveIndexHeader` (memoised, own selector); freshness indicator reads `lastUpdateAt` itself. The page now renders on snapshot/expiry/window changes only. |
| Zustand → AG Grid | Each frame merged all rows (≤ 81) against the store.                                                                                                                                  | Store exposes `lastBatchKeys`; grid accumulates dirty contract keys and merges only affected rows, one `applyTransactionAsync` per animation frame.                         |
| Chart             | Candles are REST/history; unaffected by ticks.                                                                                                                                        | No change.                                                                                                                                                                  |
| Memory            | Bounded: per-client coalescing queues, latency ring buffer (256), HTTP histogram (≤ 40 series), pending OAuth states (≤ 20), state store trimmed when a key's last subscriber leaves. | Kept; verified ~140 MiB RSS idle.                                                                                                                                           |

Not changed on purpose: the 100 ms flush cadence, the 2 s snapshot cache, the 15-minute
metadata TTL — all already at the cheap end, and every change above was made only where a
concrete waste was found.

## Free deployment

Single-instance mode is the default (in-process state/bus/lease). Redis is optional and
degrades gracefully. Connection limits, rate limits, payload caps, bounded queues, no tick
persistence, small Prisma pool (`DATABASE_POOL_MAX=4`), silent success logs in production
(`HTTP_REQUEST_LOGGING`), metrics computed on scrape only, graceful shutdown with a 10 s
deadline, readiness that never depends on optional infrastructure. Details and the Docker
topology: `docs/deployment.md`.

## SEO

`<Seo>` (React 19 head hoisting) provides title/description templates, canonical, Open
Graph and Twitter metadata for public routes and `noindex,nofollow` without canonical/OG for
private ones. `src/app/seo/sitemap.ts` is the single indexing rulebook: public = `/`,
`/markets`, six index pages; private = option-chain screens, `/api`, `/ws`. `prebuild` emits
`public/robots.txt` and `public/sitemap.xml` from it. Semantic landmarks and ARIA (radiogroup
expiries, labelled navigation tree, `aria-live` status) were verified in component tests.

## Observability

`/metrics` names are documented in `docs/deployment.md`; alert rules and the Grafana
dashboard live in `infrastructure/`. Sentry is opt-in and scrubbed (tests:
`sentry.test.ts` in both workspaces).

## Security

Full checklist in `docs/security.md`. Material changes this phase: state-bound OAuth
callback, SSRF host pinning, extended log redaction, dependency overrides.

## Database review

- Indexes: `instruments(instrumentKey)`, `(exchangeCode, symbol)`, `(exchangeCode, kind)`,
  `(hasOptionChain, isActive)`; `expiries(instrumentId, expiryDate)` unique +
  `(instrumentId, isActive, expiryDate)` for the "active expiries after today" scan;
  `option_instruments(contractKey)`, `(expiryId, strike, optionType)` unique,
  `(instrumentId, expiryId)` for chain assembly; provider mapping uniques. All queries the
  service issues are covered by a leading-column index; no sequential scans on hot paths.
- Writes: metadata upserts on provider refresh (≤ once per 15 min per underlying), encrypted
  token rotation. **No realtime ticks.**
- Pool: 4 connections; readiness pings with `SELECT 1`.
- Migrations: two hand-authored SQL migrations; CI applies them to a fresh PostgreSQL and
  fails on schema drift. Never edit production schema outside a migration.

## Verification performed

`pnpm verify` (typecheck, lint, 99 backend + 88 frontend tests, builds) ✔ ·
`pnpm audit --audit-level=high` ✔ · secrets grep of source and `frontend/dist` ✔ ·
Redis unreachable → single-instance ✔ · provider auth outage → `RECONNECTING`, readiness 200 ✔ ·
`SIGTERM` clean exit ✔ · OAuth replay rejected with redacted log ✔ · no `setInterval` polling
of realtime data (unit-tested query options + Playwright assertion).

## Limitations

Playwright browsers could not be downloaded in the authoring sandbox, so `pnpm test:e2e`
is provided and type-checked but was not executed there. The Upstox runtime path is
documentation-verified and test-covered with a scripted transport, not soak-tested against
the live feed.
