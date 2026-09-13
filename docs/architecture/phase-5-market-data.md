# Market data, option analytics, realtime hardening (0.6.0)

Scope from the audit: fix the broken chart path, add the instruments endpoint, add derived
option analytics, give the provider simulator real fault modes, and shard the upstream feed.
Existing gateway/registry/router/store components were kept; two measured changes were made.

## Charts

`ChartsModule` → `MarketDataProvider.getCandles(key, interval, count)`. Upstox adapter (verified
against _Historical Candle Data V3_ and _Intraday Candle Data V3_, 2026-09-11): one
`/v3/historical-candle/{key}/{unit}/{n}/{to}/{from}` call bounded by the documented retrieval
window per unit, plus `/v3/historical-candle/intraday/...` for the live session; rows
`[ts, o, h, l, c, v, oi]` merged by bar time. Indexes have no traded volume, so `volume` is
omitted rather than reported as 0. Cached per (instrument, interval) for one bar length
(15 s–5 min), in-flight coalesced. The chart's last bar moves from stream ticks on the client.

## Option analytics

`modules/option-chain/option-analytics.ts` — pure functions over the assembled strikes:
OI PCR, volume PCR, max pain (writer-payout minimum), ATM IV (mean of ATM CE/PE), top-3
OI / ΔOI / volume per side with share, support (PE OI walls ≤ spot) and resistance (CE OI
walls ≥ spot). The DTO carries `derived: true`; the UI strip is labelled "Derived". Per-leg
`spread = ask − bid`. Snapshot analytics are recomputed on every REST snapshot only — they are
not streamed; a live ΔOI-driven recomputation belongs with the alert engine.

## Provider simulator

`MockMarketFeedProvider` gained `simulateReconnect`, `simulateSilence`,
`simulateHeartbeatTimeout`, `emitRaw` (malformed), `simulateDuplicate`, `simulateStale`,
`simulateDelayed`, `simulateBurst`. `market-stream.faults.test.ts` pins the contract for each:
malformed → counted and dropped, siblings flow; duplicate → no fanout; stale → no regression;
delayed → accepted with receipt lag; burst → one state per key; disconnect/reconnect/silence/
heartbeat timeout → status sequence `RECONNECTING → CONNECTING → AUTHENTICATING → CONNECTED →
DEGRADED → RECONNECTING`; provider failure at start → logged, clients still admitted.

## Sharding

`ShardedMarketFeedProvider` owns N `UpstoxMarketFeedProvider` shards (`UPSTOX_FEED_CONNECTIONS`,
max 2 per Upstox's limit), assigns each key to one shard first-fit by capacity, and reports the
worst shard state. With one shard it is a transparent pass-through, so the gateway is unchanged.

## Measurements

`bench:fanout` (200 clients × 300 keys, 100k routed updates): 35k → 78k updates/s after the
coalescing-queue overwrite change; flush of 200 frames (12.6 MB total) in 15 ms thanks to
single-encode fanout; 29 MB heap.
