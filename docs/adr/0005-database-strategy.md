# ADR-0005: PostgreSQL for durable metadata only

Status: accepted · Date: 2026-09-11

## Context

Realtime ticks arrive at hundreds per second; metadata changes daily.

## Decision

Prisma 7 + pg adapter, small pool, models for instruments/expiries/contracts/provider mappings/credentials (users, watchlists, alerts next). Hand-authored migrations validated in CI by `migrate deploy` + `migrate diff --exit-code`.

## Alternatives

Tick persistence (rejected: cost and no product need), a time-series store (deferred until history features exist).

## Trade-offs and consequences

Reads dominate; writes happen on provider refresh only.
