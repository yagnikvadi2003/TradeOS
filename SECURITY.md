# Security Policy

## Reporting a Vulnerability

Please report suspected security vulnerabilities privately to the repository maintainers.

**Do not create a public GitHub issue for a security vulnerability.**

When reporting a vulnerability, provide:

- A clear description of the issue
- Affected component or endpoint
- Reproduction steps, where available
- Potential security impact
- Relevant logs or screenshots, with secrets and personal information removed

Please do not include credentials, access tokens, API keys, or other secrets in the report.

---

# Security Principles

TradeOS follows a defense-in-depth security model across the frontend, backend, provider integrations, data layer, and deployment infrastructure.

## 1. Provider Credential Isolation

Provider credentials, including future Upstox access/refresh tokens and client secrets, must exist only within trusted backend infrastructure.

They must never be:

- Embedded in frontend source code
- Exposed through `VITE_*` variables
- Stored in browser localStorage/sessionStorage
- Sent to the browser
- Included in API responses
- Written to application logs
- Committed to Git

The browser must never communicate directly with an external market-data provider.

---

## 2. Provider Boundary

All external provider responses must pass through the backend provider adapter boundary.

Provider-specific payloads are:

1. Received by the provider adapter
2. Schema-validated
3. Normalized into TradeOS domain types
4. Passed to application services

The application domain must not depend directly on provider-specific payload structures.

---

## 3. Market Data Integrity

TradeOS must never fabricate live market data.

Simulated market data is restricted to development and testing environments and must be explicitly identified as simulated.

Production configuration must not silently fall back from a live provider to simulated market data.

---

## 4. Request Validation

External input must be validated before reaching application logic.

Validation applies to:

- Route parameters
- Query parameters
- Request bodies
- Provider responses
- Environment configuration
- WebSocket messages

Invalid input must be rejected using standardized error codes.

---

## 5. Error Handling

API errors use a consistent structure:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message"
  }
}
