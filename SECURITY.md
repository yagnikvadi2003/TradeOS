# Security policy

## Reporting

Report vulnerabilities privately to the maintainers. Do not open public issues for security
findings.

## Principles (enforced from phase 1)

- Provider credentials (Upstox access/refresh tokens, client secrets) live only in the backend.
  The frontend bundle contains no secrets; only `VITE_`-prefixed, non-sensitive settings.
- The browser never connects to a market-data provider directly. All data flows through the
  TradeOS backend (REST for snapshots, WebSocket for realtime).
- No live market data is fabricated. Simulated data exists only in development/tests and is
  labelled as such in the UI; production builds cannot select it.
- Private trading screens are `noindex` and excluded from the sitemap.
- Every external response is schema-validated before it reaches application state.
- `.env` files (other than the committed non-secret `.env.example` / `.env.development`) are
  git-ignored.

## Security review

The phase 4 review (authentication, authorization, CORS, Helmet, rate limiting, WebSocket, input
validation, secrets, logging, dependencies, CSRF, XSS, SSRF, injection, resource exhaustion,
subscription abuse) is recorded in `docs/security.md`.
