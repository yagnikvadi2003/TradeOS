# ADR-0008: Authentication model (current and next)

Status: accepted · Date: 2026-09-11

## Context

Market data is public; the WebSocket must still be authenticated to enforce limits.

## Decision

Today: anonymous 15-minute HS256 session tokens from `/realtime/token`, rate-limited; every socket must present one. Next: cookie-based user sessions (SameSite + CSRF token) that issue the same stream tokens, so the WebSocket contract does not change.

## Alternatives

Unauthenticated sockets (no per-client accounting), JWT in cookies for WS (cross-origin pain).

## Trade-offs and consequences

The issuer is the only component that changes when users arrive.
