# TradeOS Market Stream Protocol — v1

Endpoint: `/ws/market` (same origin as the REST API). Text frames, UTF-8 JSON, one message per
frame. Independent of OpenAPI; the authoritative schema is
`backend/src/common/realtime/ws-messages.ts` (Zod) with a browser mirror in
`frontend/src/services/websocket/market-stream.messages.ts`.

## Connection lifecycle

```
upgrade ──▶ origin allow-list ──▶ connection caps (global, per IP) ──▶ socket open
   │
   ▼  first frame must be `auth` within 10 s, else close 4001
auth ok ──▶ connection_status ──▶ subscribe / unsubscribe / heartbeat …
   │
   └── server ping every 15 s; two missed pongs ──▶ close 4014
```

Every server → client frame carries `type`. Every client → server frame is validated;
malformed frames answer with `error{code:"INVALID_MESSAGE"}` and the socket stays open.

## Client → server

| type          | fields                          | notes                                                                                                                                                               |
| ------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth`        | `token`                         | HS256 session token from `GET /api/v1/realtime/token`. Must be first. Invalid → `error{AUTH_FAILED, fatal}` then close 4003.                                        |
| `subscribe`   | `instruments: string[]` (1–500) | TradeOS keys only: `NSE:INDEX:NIFTY50`, `NSE:OPT:NIFTY50:2026-09-15:24000:CE`. Unknown/unauthorized keys are listed in the ack's `rejected`; the rest are accepted. |
| `unsubscribe` | `instruments: string[]`         | Idempotent.                                                                                                                                                         |
| `heartbeat`   | `sentAt?: number`               | Optional client probe; echoed with `serverTime` for latency.                                                                                                        |

Limits: `WS_MAX_MESSAGE_BYTES` (16 KiB, close 1009), `WS_MESSAGES_PER_SECOND` (token bucket;
breach → `error{RATE_LIMITED, fatal}` + close 4008), `WS_MAX_SUBSCRIPTIONS_PER_CLIENT` (600;
breach → `error{SUBSCRIPTION_LIMIT}`, nothing changes).

## Server → client

| type                | fields                                                                                                                                                                 | when                                                                                                                                                   |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `auth`              | `ok:true, sessionId, expiresAt, protocol:1`                                                                                                                            | after a valid token                                                                                                                                    |
| `connection_status` | `provider: DISCONNECTED\|CONNECTING\|AUTHENTICATING\|CONNECTED\|DEGRADED\|RECONNECTING\|STOPPING`, `stale: boolean`, `markets?: [{exchangeCode, segment, status, at}]` | right after `auth`, and whenever the upstream feed state changes                                                                                       |
| `subscribe`         | `ok:true, instruments[], rejected[]`                                                                                                                                   | ack                                                                                                                                                    |
| `snapshot`          | `updates: MarketUpdate[]`                                                                                                                                              | immediately after a subscribe, for keys the server already holds state for (may be partial)                                                            |
| `delta`             | `updates: MarketUpdate[]`, `dropped?: number`                                                                                                                          | coalesced changes since the last flush (≤ 1 frame / 100 ms / client; at most one entry per key; `dropped` counts entries evicted by the bounded queue) |
| `unsubscribe`       | `ok:true, instruments[]`                                                                                                                                               | ack                                                                                                                                                    |
| `heartbeat`         | `serverTime, sentAt?`                                                                                                                                                  | reply to a client heartbeat                                                                                                                            |
| `error`             | `code, message, fatal?`                                                                                                                                                | see codes below; `fatal` frames are followed by a close                                                                                                |

`MarketUpdate` is a discriminated union on `kind`:

- `index`: `instrumentKey, timestamp, receivedAt, ltp, previousClose, open, high, low, change,
changePercent, volume, source`
- `option`: `contractKey, underlyingKey, exchangeCode, expiryDate, strike, optionType, timestamp,
receivedAt, ltp, previousClose, change, changePercent, volume, openInterest,
openInterestChange, impliedVolatility, bid, ask, bidQuantity, askQuantity, greeks, source`

Unavailable values are `null`, never `0`. `source` is `live`, `snapshot` or `simulated`
(the last only from the mock provider, refused in production). `timestamp` is the provider's
exchange time in epoch ms; consumers must ignore an update older than the one they hold.

Error codes: `UNAUTHENTICATED`, `AUTH_FAILED`_, `INVALID_MESSAGE`, `NOT_AUTHORIZED`,
`RATE_LIMITED`_, `SUBSCRIPTION_LIMIT`, `MESSAGE_TOO_LARGE`_, `SERVER_BUSY`_ (* = fatal).

Close codes: 1001 shutdown · 4001 auth timeout · 4003 auth failed · 4008 rate limited ·
4009 message too large · 4013 server busy · 4014 heartbeat timeout.

## Stale data

`connection_status.stale` is `true` while the provider is `DEGRADED` (no frame for
`FEED_STALE_AFTER_MS`) or `RECONNECTING`. Clients keep showing the last state and should mark
it as stale; the reference client sets its indicator to `degraded`. Values resume with a
`delta` (no `snapshot` is re-sent for keys the client already holds).

## Reconnect behaviour (reference client)

Exponential backoff 1 s → 30 s with 40 % jitter; after `AUTH_FAILED` the client waits the
full window before retrying. On every fresh socket the client re-authenticates, resubscribes
every retained key in one frame and receives a `snapshot` for them. Session tokens are
reused until 60 s before expiry.

## Versioning

`auth.protocol` announces the server protocol version. Additive changes (new optional fields,
new `kind`s clients may ignore) do not bump it; removals or semantic changes do, and the
server will keep serving the previous version for one release. `requestId` is reserved as an
optional client field on `subscribe`/`unsubscribe` for a future ack correlation and is
currently ignored.
