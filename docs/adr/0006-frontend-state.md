# ADR-0006: Frontend state: Query for REST, Zustand for realtime and UI

Status: accepted · Date: 2026-09-11

## Context

Live data must not re-render the app per tick.

## Decision

TanStack Query owns REST snapshots (no polling). A Zustand market-state store receives one batch per delta frame; components subscribe per key; the AG Grid reads the store outside React and applies row transactions per animation frame.

## Alternatives

Redux (ceremony), putting ticks into Query cache (invalidation storms), Context (re-render fan-out).

## Trade-offs and consequences

Page components render on navigation/snapshot changes only; measured in tests (`option-chain-grid.test.tsx`, `market-state.store.test.ts`).
