# Product features + production audit (0.7.0)

## Features delivered (priority order from the directive)

| #   | Capability                | Implementation                                                                                                                                                                                                                                                                                                                                                                                              |
| --- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Watchlists                | `Session` (device cookie) → `watchlists` / `watchlist_items` (Prisma + in-memory). REST CRUD with reorder, limits (10 lists × 50 items), ownership enforced in the repository. UI: `WatchlistPanel` on `/markets` — live rows via per-key store selectors, keyboard-accessible reorder (no drag-and-drop dependency).                                                                                       |
| 2   | Alerts                    | `alerts` table, 10 conditions. **Alert engine** is a pseudo-client of the Market Data Gateway: keys with active alerts are reference-counted like browser subscriptions, evaluation is O(alerts on the updated key) via `AlertIndex`, one-shot or re-arm. PCR conditions evaluate once a minute from the assembled chain (live state first — no provider call when warm). UI: `AlertsPanel` on index pages. |
| 3   | Notifications             | `notifications` table (bounded 200/session) + live `notification` frame on `/ws/market` addressed to the session's sockets (bypasses coalescing queues). UI: header tray with unread badge, inbox, mark-all, browser `Notification` opt-in (only when the tab is hidden).                                                                                                                                   |
| 4   | Market dashboard          | `/markets` overview (existing ticker strip + table) now hosts watchlists; the existing terminal layout is unchanged.                                                                                                                                                                                                                                                                                        |
| 5   | Advanced option analytics | Delivered in 0.6.0 (PCR, max pain, ATM IV, concentrations, S/R) — extended here with PCR alerts.                                                                                                                                                                                                                                                                                                            |
| 6   | Charts                    | Indicator library (SMA, EMA, RSI, MACD, Bollinger, ATR, VWAP; pure, tested) with SMA 20 / EMA 50 / BB 20 price overlays toggled in the chart toolbar. RSI/MACD/ATR are computed but not yet panelled.                                                                                                                                                                                                       |
| 7   | Futures                   | **Not implemented** — the Upstox futures contract endpoint was not verified in this phase; nothing was faked.                                                                                                                                                                                                                                                                                               |
| 8   | Market calendar           | `market_calendar_days` (operator-loaded from official circulars; nothing guessed) + `GET /market-calendar` with regular schedule, today's state and next open. Frontend still uses its pure evaluator; server override wiring is next.                                                                                                                                                                      |
| 9   | Preferences               | `preferences` table, `GET/PUT /preferences` with a strict key schema.                                                                                                                                                                                                                                                                                                                                       |

Authentication model: anonymous **device sessions** (ADR-0008 step 1). Cookie `tradeos_sid`, HttpOnly, SameSite=Lax, Secure in production, HMAC-signed id, 30-day sliding expiry, server-side row. CSRF: mutations require `X-Requested-With: TradeOS` (custom header ⇒ CORS preflight) on top of SameSite. Guarded routes never mint sessions; `GET /session` does. Stream tokens are session-bound so alert pushes reach the right sockets.

## Audits

### Security

No new secrets in tree (grep) or bundle; cookie signed before any DB lookup (forged ids cost nothing); ownership in every repository query (cross-session access → 404, tested); limits on lists/items/alerts/notifications; strict preference schema; `pnpm audit --audit-level=high` clean (4 dev-only moderates: vitest/@swc/cli). Open: no per-session rate limit on mutations beyond the global throttler; sessions are anonymous by design.

### Performance

`bench:fanout` 78k updates/s (0.6.0); alert evaluation adds one Map lookup per update key; PCR evaluation is one snapshot per underlying per minute and only while PCR alerts exist. Watchlist rows subscribe per key and re-render per key. No REST polling anywhere (`refetchInterval: false` everywhere; the only intervals are the IST clock, the freshness label and the WS heartbeat).

### Memory

Bounded: coalescing queues (cap), latency ring (256), HTTP histogram (≤40 series), pending OAuth states (≤20), notifications (200/session), alert index (= active alerts), remote demand (TTL 90 s). Engine untracks before persisting a trigger so bursts cannot re-fire. Listener/timer cleanup on every module destroy and React effect.

### Database

New tables have FK cascades from `sessions`, uniques on natural keys, indexes for every query the controllers issue (`(sessionId, position)`, `(status, instrumentKey)`, `(sessionId, createdAt DESC)`). Writes: user actions and alert triggers only — **no ticks**. Migration `20260912000000_sessions_watchlists_alerts` is hand-authored and CI-validated.

### WebSocket

Protocol v1 gained one additive server frame (`notification`); everything else unchanged. Verified by the existing gateway suite plus the alerts integration test (engine subscribes upstream, releases on one-shot trigger).

### Accessibility

New UI: labelled controls, `radiogroup`/`aria-pressed`/`dialog` semantics, Escape closes the tray, reorder by buttons (keyboard), `role="alert"` on mutation errors, focus-visible from the design tokens.

### SEO

Unchanged: public index pages indexed; option chain, watchlist/alert data are session-private and never rendered into public HTML.

### CI/CD

Workflows unchanged from 0.5.0 (permissions, audit, Docker build, E2E jobs); new tests run in the unit/integration split.

### Deployment (researched Sept 2026 — recheck vendor pages before committing)

The backend holds persistent sockets to browsers _and_ to Upstox, so it must not sleep:

- **Render free**: spins down after 15 min without traffic, ~1 min cold start, free Postgres expires after 30 days → unsuitable for the backend; fine for nothing here.
- **Railway**: no free tier (one-time trial credit); Hobby $5/mo includes $5 usage; a 512 MB always-on service ≈ $6–9/mo.
- **Fly.io**: no free tier for new orgs; shared-cpu-1x 512 MB ≈ $3.32/mo, 1 GB ≈ $5.92/mo; egress metered (India region rate is the highest tier) — bandwidth is our main variable cost because deltas scale with open option chains.
- **Hetzner Cloud (CX-class VPS)**: ~€4–5/mo for 2 vCPU / 4 GB with 20 TB egress; no India region (EU latency ~150 ms to Indian users; the provider feed latency is Upstox→EU).
- **DigitalOcean Bangalore droplet**: $6/mo, 1 GB, 1 TB egress — India-local.

**Recommendation**: `infrastructure/docker/docker-compose.yml` on a small VPS in or near India (DigitalOcean BLR $6 or Hetzner if latency is acceptable), managed Postgres free tier (Neon/Supabase) or the compose Postgres, Redis omitted (single-instance mode). Static frontend on Cloudflare Pages/Netlify free tier. Expected all-in: **$4–8/month**; "free" is not achievable for an always-on WebSocket backend in 2026.

### Observability

Alerts add `activeAlerts` gauge and `alertsTriggered` counter to `/metrics`; everything else as 0.5.0.

## Verification (commands run this phase)

- `pnpm verify` ✔ (backend 129 tests, frontend 96) · `pnpm audit --audit-level=high` ✔
- No browser→Upstox: the only frontend match is a comment · no realtime-path DB writes (only the credential store) · 33/33 REST operations in `docs/openapi.json` · no `refetchInterval`/fetch polling · secrets grep clean

## Production-readiness score (evidence-based)

| Area            | /10     | Basis                                                                                             |
| --------------- | ------- | ------------------------------------------------------------------------------------------------- |
| Architecture    | 8       | Ports/adapters, gateway, bounded queues; futures/calendar wiring pending                          |
| Code quality    | 8       | Strict TS, lint clean, Zod at every boundary                                                      |
| Security        | 7       | Cookie sessions + CSRF, host pinning, redaction; no user accounts, no per-session mutation limits |
| Testing         | 7       | 225 tests incl. WS integration; E2E written but unexecuted here; no real-PG tests                 |
| Performance     | 8       | Measured fanout; render isolation; no polling                                                     |
| Reliability     | 7       | Reconnect/backoff/stale/lease tested; live Upstox never soaked                                    |
| Accessibility   | 7       | Semantics and keyboard paths; no audit tooling run                                                |
| SEO             | 8       | Templates, sitemap/robots, private noindex                                                        |
| DevOps          | 6       | CI complete on paper; Docker/E2E jobs unexecuted; no deploy stage                                 |
| Observability   | 8       | Full metric set, alerts, dashboard, scrubbed Sentry                                               |
| Documentation   | 8       | ADRs, protocol, API, deployment, phase notes                                                      |
| Maintainability | 8       | Small modules, repository ports, one error contract                                               |
| **Overall**     | **7.5** | Ready for a monitored first live soak, not for unattended production                              |

## Remaining limitations

Futures; server-authoritative market status in the UI; RSI/MACD panes; anonymous sessions only; live Upstox path unverified; E2E/Docker jobs unrun in the authoring sandbox.
