# ADR-0003: Centralised market-data gateway

Status: accepted · Date: 2026-09-11

## Context

Hundreds of browsers, a provider that allows two connections and 1500 keys.

## Decision

One gateway per instance with a `SubscriptionRegistry` (key → subscriber set, refcounted), a per-instance leader holding the provider feed (`FeedLease`), fleet-wide refcounts over a bus, per-client coalescing queues with backpressure, and a single-encode fanout.

## Alternatives

Per-user upstream sockets (impossible), server-sent events (no client→server subscribe), polling (explicitly forbidden).

## Trade-offs and consequences

Memory is bounded by distinct keys per client; a slow browser cannot grow the server. Sharding across the second permitted connection is planned when demand exceeds the cap.
