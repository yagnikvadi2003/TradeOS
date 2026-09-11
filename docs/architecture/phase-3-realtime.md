# Phase 3 — Realtime market data: Upstox feed, gateway, `/ws/market`

## Goal

Stream market data from the official Upstox Market Data Feed V3 into subscribed browsers
through a centralized gateway — one upstream connection, deduplicated subscriptions,
normalized domain contracts, bounded fanout — with an in-process mode for free/single-instance
deployment and Redis for horizontal scale. The browser never talks to Upstox.

Verified against the official documentation on 2026-09-09: Market Data Feed V3 (binary-JSON
`sub`/`unsub`/`change_mode` requests, protobuf `FeedResponse`, `market_info` → snapshot → live
ordering, ping keep-alive, 2 connections / 1500 keys in `full` mode), Option Contracts
(`/v2/option/contract`), Put/Call Option Chain (`/v2/option/chain`), Market Data Feed
Authorize (`/v3/feed/market-data-feed/authorize`), OAuth token exchange
(`/v2/login/authorization/token`), and the published `MarketDataFeedV3.proto` (embedded at
`providers/upstox/proto/market-data-feed-v3.proto.ts`).

## Pipeline

```
Upstox WebSocket (protobuf)
  │  UpstoxFeedTransport            authorize → wss URL → socket; ping/pong by `ws`
  ▼
UpstoxMarketFeedProvider           ProviderConnectionManager + ProviderSubscriptionManager
  │  codec (protobufjs) → Zod       decode + validate per frame; malformed frames counted, dropped
  │  UpstoxFeedNormalizer           Upstox fields → IndexTick | OptionTick (nulls, never zeros)
  ▼
MarketStreamService                second Zod validation at the domain boundary
  │  MarketStateStore               latest update per key (memory | Redis hash, coalesced writes)
  │  MessageBus                     in-process | Redis pub/sub (one topology, same code path)
  ▼
MarketDataRouter                   instrumentKey → subscriber set → per-client CoalescingQueue
  │  flush every WS_FLUSH_INTERVAL_MS, latest state per key, backpressure hold, bounded drops
  ▼
MarketStreamGateway  /ws/market    auth-first, validated, rate-limited, capped, heartbeated
  ▼
WsMarketStream (browser)           Zod-validated frames → market-state store → grid transactions
```

### Reference counting (three levels)

| Level    | Structure                                                                                     | First/last transition                       |
| -------- | --------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Browser  | `WsMarketStream.refs` (key → count)                                                           | one `subscribe`/`unsubscribe` frame per key |
| Instance | `SubscriptionRegistry` (key → client set)                                                     | `added`/`removed` → upstream demand         |
| Fleet    | `MarketStreamService.upstreamRefs` (leader only; other instances publish demand over the bus) | `feed.subscribe`/`feed.unsubscribe`         |

100 users on 3 instances watching BANK NIFTY = 1 upstream subscription. The lease holder
(`FeedLease`: in-process always-leader, or Redis `SET NX PX` renewed every 5 s) is the only
process with a provider socket; losing the lease stops the feed and re-announces demand.

### Provider connection manager

State machine `DISCONNECTED → CONNECTING → AUTHENTICATING → CONNECTED ⇄ DEGRADED →
RECONNECTING → …`, `STOPPING → DISCONNECTED`; illegal transitions throw. Exponential backoff
(1 s → 60 s, factor 2, 40 % jitter); an auth failure waits the maximum delay rather than
hammering the token endpoint. Connect timeout, stale watchdog (`FEED_STALE_AFTER_MS` of
silence → DEGRADED, twice → forced reconnect; Upstox pings idle sockets, so silence is a real
signal), automatic resubscription of the desired set on every fresh socket, batched
`sub`/`unsub` frames capped at `UPSTOX_MAX_SUBSCRIPTIONS`, generation-tagged callbacks so a
late event from an old socket can never act on the new one.

### Backpressure

`CoalescingQueue` per client: a newer update for a key replaces the pending one, so growth is
bounded by distinct keys, capped at `2 × WS_MAX_SUBSCRIPTIONS_PER_CLIENT` (oldest key dropped
and counted). A client whose socket buffer exceeds 512 KB is skipped at flush and keeps
coalescing in place. Deltas carry `dropped` when something was lost. Control messages (auth,
subscribe acks, heartbeat, status, errors) bypass the queues entirely. The store rejects
out-of-order ticks by timestamp, so retries and duplicates never move state backwards.

### Security

Upgrade → origin allow-list (`CORS_ORIGINS`) → global and per-IP connection caps → socket. The
first message must be `auth` within 10 s with an HS256 session token (`GET /api/v1/realtime/token`,
15 min, anonymous until the users module issues them from real sessions). Every inbound frame:
size-capped by `ws` (`WS_MAX_MESSAGE_BYTES`), token-bucket rate-limited (`WS_MESSAGES_PER_SECOND`,
fatal on breach), Zod-validated discriminated union. Subscriptions are authorized per key —
catalog instruments only, option contracts only for option-chain underlyings, and within the
token's scope — and capped per client. Upstox credentials: static `UPSTOX_ACCESS_TOKEN` or the
OAuth code exchange (operator-key-guarded endpoints) stored AES-256-GCM encrypted
(`provider_credentials`, migration `20260909120000_provider_credentials`). Tokens are never
logged or returned.

### Observability

`/health` embeds the realtime snapshot; `/metrics` (Prometheus text) exposes
`tradeos_provider_connected`, `_provider_reconnects_total`, `_provider_messages_total`,
`_normalized_messages_total`, `_invalid_messages_total`, `_ws_active_clients`,
`_ws_active_subscriptions`, `_ws_subscribed_keys`, `_subscription_changes_total`,
`_fanout_messages_total`, `_fanout_updates_total`, `_dropped_messages_total`,
`_stale_data_events_total`, `_ws_auth_failures_total`, `_ws_rate_limited_total`,
`_ws_latency_ms_p50/max`, `_redis_available`, plus process memory and CPU. No collector timers:
the endpoint computes on scrape only.

### Single-instance mode

Without `REDIS_URL` the same abstractions resolve to `InMemoryMarketStateStore`,
`InProcessMessageBus` and `InProcessFeedLease`. A configured-but-unreachable Redis logs a
warning and degrades to this mode instead of failing boot; a Redis error mid-flight is reported
and never throws into the data path.

## Frontend

`WsMarketStream` (native WebSocket): auth before anything, refcounted keys, resubscribe on
reconnect, backoff with jitter (auth rejection → full window), heartbeat latency, forced
reconnect on a missed heartbeat, idle close when nothing is retained, Zod-validated inbound.
`MockMarketStream` is the deterministic twin (same generator as the REST simulator, tagged
`simulated`). `MarketStreamProvider` owns one stream per app and feeds two stores:

- `market-state.store` — one `set` per delta frame; entries keep their reference unless
  changed; selectors (`useLiveIndexTick`, `useLiveNewestTimestamp`) re-render per key only.
- `connection.store` — state changes only (`idle/connecting/connected/degraded/reconnecting/…`).

Render path: `provider tick → delta frame → store batch → grid subscribes to the store outside
React → mergeRowsLive (rows unchanged by reference) → one applyTransactionAsync per animation
frame`. The option-chain page retains the underlying plus every contract in the visible window;
the index header and market page use `useLiveIndexQuote` (REST seed, stream override when newer).

## Tests

Backend (96): registry duplicate/unsubscribe/refcount/removeClient; coalescing queue bounds
and drops; backoff/jitter; state machine; Upstox provider with a scripted transport — connect,
dedupe/batch, cap, disconnect → backoff → resubscribe, auth failure → max delay, silence →
DEGRADED → heartbeat-timeout reconnect, malformed frames isolated, normalization of
partial feeds; stream service — multiple clients/one upstream subscription, multiple
instruments, authorization (catalog, VIX options, scope), stale ticks, invalid updates, provider
status; router — coalescing, backpressure, drops, detach; gateway integration with real `ws`
clients — bad origin, unauthenticated subscribe, bad token close 4003, snapshot then coalesced
deltas across clients, disconnect cleanup, client reconnect, subscription cap, rate limit close
4008, oversized frame close 1009; Redis unreachable → null handle, failing Redis → reported not
thrown, hash mirroring/hydration, bus, lease exclusivity; token service, cipher, OAuth exchange,
REST client, snapshot provider (live-state-first, chain fallback).

Frontend (84): stream client with a fake socket (auth-first, refcounts, invalid frames dropped,
reconnect + resubscribe, heartbeat latency and timeout, degraded mirroring, auth backoff);
market-state store (immutability, stale rejection, per-key selectors); mock stream; live merge
(legs by reference, stale ticks ignored, header override); routes (stream idle off-page, index
page subscribes and paints ticks, option chain retains 1 + 2 × window keys and releases them on
navigation).

## Out of scope (next)

Users/auth module issuing session tokens, Playwright E2E against the gateway, Docker/Nginx and
the Grafana dashboard for `/metrics`, `change_mode` upstream (mode is fixed per deployment).
