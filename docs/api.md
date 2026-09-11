# API (v1)

Base path `/api/v1`. OpenAPI UI at `/api/docs` (non-production). All responses are JSON;
errors use one shape: `{ "error": { "code", "message", "details?" } }`.

| Method | Path                                         | Cache                 | Purpose                                                                    |
| ------ | -------------------------------------------- | --------------------- | -------------------------------------------------------------------------- |
| GET    | `/market/quotes?instrumentKeys=A,B`          | `no-store`            | REST seed for index headers (≤ 6 keys). Live state → 2 s cache → provider. |
| GET    | `/option-chain/:instrument`                  | `private, max-age=60` | Metadata: lot size, strike step, expiries, nearest expiry.                 |
| GET    | `/option-chain/:instrument/expiries`         | `private, max-age=60` | Listed expiries with cycle and days-to-expiry.                             |
| GET    | `/option-chain/:instrument/snapshot?expiry=` | `no-store`            | Assembled chain (initial snapshot only — never polled).                    |
| GET    | `/realtime/token`                            | `no-store`            | 15-min HS256 session token for `/ws/market` (10/min per IP).               |
| GET    | `/providers/upstox/auth/status`              | `no-store`            | Operator: token presence/expiry (never the token). `X-Operator-Key`.       |
| GET    | `/providers/upstox/auth/url`                 | `no-store`            | Operator: login URL + single-use `state`. `X-Operator-Key`.                |
| GET    | `/providers/upstox/auth/callback?code&state` | `no-store`            | Exchanges the code; authorized by `state`.                                 |
| GET    | `/health`, `/health/live`, `/health/ready`   | —                     | Health (unversioned).                                                      |
| GET    | `/metrics`                                   | `no-store`            | Prometheus text (unversioned).                                             |

`:instrument` is a TradeOS key such as `NSE:INDEX:NIFTY50` (URL-encoded). Error codes:
`VALIDATION_FAILED` 400 · `INSTRUMENT_NOT_FOUND` / `OPTION_CHAIN_NOT_SUPPORTED` /
`EXPIRY_NOT_FOUND` 404 · `RATE_LIMITED` 429 · `PROVIDER_PAYLOAD_INVALID` 502 ·
`PROVIDER_UNAVAILABLE` 503.

## WebSocket `/ws/market`

Text frames, JSON, protocol version 1. See `docs/architecture/phase-3-realtime.md` for the
pipeline; the contract:

Client → server: `auth {token}` (first, within 10 s) · `subscribe {instruments[]}` ·
`unsubscribe {instruments[]}` · `heartbeat {sentAt?}`.

Server → client: `auth {ok, sessionId, expiresAt, protocol}` · `subscribe {instruments,
rejected}` · `unsubscribe {instruments}` · `snapshot {updates}` · `delta {updates,
dropped?}` · `heartbeat {serverTime, sentAt?}` · `connection_status {provider, stale,
markets?}` · `error {code, message, fatal?}`.

Limits (env): `WS_MAX_CONNECTIONS`, `WS_MAX_CONNECTIONS_PER_IP`,
`WS_MAX_SUBSCRIPTIONS_PER_CLIENT`, `WS_MAX_MESSAGE_BYTES`, `WS_MESSAGES_PER_SECOND`.
Close codes: 4001 auth timeout · 4003 auth failed · 4008 rate limited · 4009 too large ·
4013 busy · 4014 heartbeat timeout · 1001 shutdown.
