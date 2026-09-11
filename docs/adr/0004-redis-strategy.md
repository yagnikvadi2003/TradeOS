# ADR-0004: Redis is optional

Status: accepted · Date: 2026-09-11

## Context

Free-tier deployments have no Redis; scaled ones need shared state and one feed owner.

## Decision

Three ports — `MarketStateStore`, `MessageBus`, `FeedLease` — with in-process implementations chosen when `REDIS_URL` is absent or unreachable, and Redis implementations (coalesced hash mirror, pub/sub, `SET NX PX` lease) otherwise. Unreachable Redis degrades to single-instance with a warning.

## Alternatives

Mandatory Redis (blocks free deployment), Postgres LISTEN/NOTIFY as a bus (ties realtime to the DB pool).

## Trade-offs and consequences

Every cache/state has key, TTL, invalidation and failure behaviour documented in `docs/deployment.md`; no tick is ever written to PostgreSQL.
