# ADR-0001: Provider authentication: backend-only service credential

Status: accepted · Date: 2026-09-11

## Context

TradeOS needs market data from Upstox. Options: (a) per-user Upstox OAuth, (b) one backend service credential (Analytics Token or daily OAuth token) shared by all users, (c) a data vendor.

## Decision

One backend-held credential: `UPSTOX_ACCESS_TOKEN` (read-only Analytics Token, 1-year) or a daily OAuth token obtained through operator-guarded endpoints and stored AES-256-GCM encrypted. The browser never sees it.

## Alternatives

Per-user OAuth couples market data to brokerage accounts nobody asked for and multiplies upstream connections. A vendor adds cost. Daily-only OAuth needs a human every morning; the Analytics Token removes that.

## Trade-offs and consequences

Market data is read-only and shared, so one credential is correct. Account features (orders, positions) would need per-user OAuth later — through a separate provider port, not the market-data gateway.
