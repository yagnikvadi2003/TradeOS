# Deployment

TradeOS is designed to run on a single small (or free) server first and scale out later
without code changes.

## Topologies

| Mode            | Infrastructure                                            | When                                                             |
| --------------- | --------------------------------------------------------- | ---------------------------------------------------------------- |
| Development     | nothing (`MARKET_DATA_PROVIDER=mock`, in-memory metadata) | local work, CI, E2E                                              |
| Single instance | PostgreSQL (metadata only) + one backend                  | free tier / small VPS; **no Redis**                              |
| Scaled          | PostgreSQL + Redis + N backends                           | many concurrent users; one backend holds the provider feed lease |

Realtime state, pub/sub and the feed lease resolve to in-process implementations when
`REDIS_URL` is absent, and degrade back to them (with a warning) if Redis is unreachable.

## Docker (single host)

```bash
cp .env.example .env            # set REALTIME_JWT_SECRET, OPERATOR_API_KEY, CREDENTIAL_ENCRYPTION_KEY,
                                # CORS_ORIGINS, MARKET_DATA_PROVIDER=upstox + Upstox settings
export POSTGRES_PASSWORD=...   SITE_ADDRESS=terminal.example.com   VITE_PUBLIC_ORIGIN=https://terminal.example.com
docker compose -f infrastructure/docker/docker-compose.yml up -d --build
docker compose -f infrastructure/docker/docker-compose.yml exec backend node node_modules/prisma/build/index.js migrate deploy
```

Caddy terminates TLS (automatic certificates for a public `SITE_ADDRESS`), serves the SPA
with immutable asset caching, sets the security headers/CSP, and proxies `/api`, `/ws` and
`/health` to the backend. The backend image runs as `node`, production deps only, with a
liveness healthcheck and a 512 MiB memory limit.

Generate the required secrets:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"   # REALTIME_JWT_SECRET / OPERATOR_API_KEY
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"      # CREDENTIAL_ENCRYPTION_KEY
```

## Resource envelope (measured, mock feed, 6 indexes + one open option chain)

- Backend RSS ≈ 140 MiB idle; CPU is dominated by JSON encoding of delta frames, which is
  now done **once per update per flush**, not once per subscriber.
- PostgreSQL: reads only after warm-up (expiries/contracts cached 15 min in process); the
  only writes are metadata upserts on provider refresh and the encrypted Upstox token.
  **No ticks are ever written.** Pool size defaults to 4 (`DATABASE_POOL_MAX`).
- Redis (optional): one `HSET` pipeline per 250 ms carrying only changed keys, one `PUBLISH`
  per validated batch, a lease renewal every 5 s. `maxmemory 64mb` is ample.
- Outbound bandwidth: ≤ one delta frame per client per `WS_FLUSH_INTERVAL_MS` (100 ms),
  containing only keys that changed.

## Health, readiness, shutdown

- `GET /health/live` — process is up.
- `GET /health/ready` — required infrastructure only: PostgreSQL when configured. Redis and
  the provider feed are _not_ readiness dependencies (they degrade, they don't block).
- `GET /health` — full snapshot including realtime metrics.
- `SIGTERM`/`SIGINT` → clients closed with `1001`, feed stopped, lease released, Redis mirror
  flushed, Prisma disconnected; hard exit after 10 s.

## Observability

- `GET /metrics` — Prometheus text (computed on scrape; no collector timers).
- `infrastructure/prometheus/prometheus.yml` + `alerts.yml` — scrape config and alert rules
  (provider disconnected, stale data, reconnect storm, drops, invalid payloads, 5xx, Redis).
- `infrastructure/grafana/tradeos-dashboard.json` — import into Grafana; select the
  Prometheus datasource via the `DS` variable.
- Sentry: set `SENTRY_DSN` (backend) / `VITE_SENTRY_DSN` (frontend, build-time). Events are
  scrubbed of Authorization/Cookie/operator headers, OAuth `code`/`state`/`token` query
  strings, request bodies, cookies, user objects and JWT/Bearer-shaped strings.

## Logging

Pino JSON. Success request lines are silent in production unless `HTTP_REQUEST_LOGGING=true`;
4xx/5xx are always logged. Headers are never serialized; `code`/`state`/`token` query values
are redacted at the serializer.

## Upstox operations

- Daily token: `GET /api/v1/providers/upstox/auth/url` (with `X-Operator-Key`) → open the
  URL → Upstox redirects to the callback with a single-use `code` and the `state` minted by
  `/url`. The callback is authorized by that state (10 min TTL, single use), so the browser
  redirect works in production without the header.
- Or set `UPSTOX_ACCESS_TOKEN` (an Analytics Token from the Upstox developer console is
  read-only and valid for a year).
- The provider host is pinned to `*.upstox.com` over HTTPS (`UPSTOX_API_BASE_URL`).
