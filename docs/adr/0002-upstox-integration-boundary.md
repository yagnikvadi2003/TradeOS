# ADR-0002: Upstox integration boundary

Status: accepted · Date: 2026-09-11

## Context

Provider payloads (protobuf feed, REST JSON with paise tick sizes, `NSE_INDEX|Nifty 50` symbols) must not shape the domain.

## Decision

`providers/upstox/{auth,rest,websocket,mappers,types}` behind two ports: `MarketDataProvider` (snapshots) and `MarketFeedProvider` (stream). Every payload is Zod-validated at the adapter and again at the domain boundary; identifiers are TradeOS keys everywhere else.

## Alternatives

Using Upstox types directly is faster to write and impossible to swap; a generic vendor SDK does not exist for Indian exchanges.

## Trade-offs and consequences

Two validation passes cost microseconds and make adapter bugs unable to reach clients. A second provider means one new folder.
