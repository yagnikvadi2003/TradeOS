# ADR-0007: Deployment platform: persistent process on a small VPS-class host

Status: accepted · Date: 2026-09-11

## Context

The backend holds long-lived WebSockets to browsers and to the provider.

## Decision

Docker images (backend Node runtime; frontend static behind Caddy) on a host that runs persistent processes with WebSocket support and a managed PostgreSQL. Serverless/edge platforms are excluded by the persistent provider connection.

## Alternatives

Serverless functions (no persistent socket), PaaS with request timeouts (breaks feeds), Kubernetes (over-scoped for one instance).

## Trade-offs and consequences

Single-instance mode fits a 512 MiB container; scaling adds Redis and instances behind the same images. Final vendor selection is left to the operator; requirements are listed in `docs/deployment.md`.
