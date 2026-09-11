import { type AppEnv } from '@/common/config/env';

/**
 * Production-safe Sentry bootstrap. Lazy-loaded so the SDK costs nothing
 * when `SENTRY_DSN` is unset. Everything that could carry a credential or a
 * person's data is stripped before an event leaves the process.
 */
const SENSITIVE_HEADERS = ['authorization', 'cookie', 'set-cookie', 'x-operator-key', 'x-api-key'];
const SENSITIVE_QUERY = ['code', 'token', 'access_token', 'state', 'client_secret'];
const TOKEN_LIKE =
  /(eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,})|(Bearer\s+[A-Za-z0-9._-]{16,})/g;

export function scrubString(value: string): string {
  return value.replace(TOKEN_LIKE, '[redacted]');
}

interface SentryLikeEvent {
  request?: {
    headers?: Record<string, string>;
    query_string?: unknown;
    cookies?: unknown;
    data?: unknown;
    url?: string;
  };
  user?: unknown;
  message?: string;
  exception?: { values?: { value?: string }[] };
  breadcrumbs?: { message?: string; data?: Record<string, unknown> }[];
}

/** Removes secrets from a Sentry-shaped event in place; exported for tests. */
export function scrubEvent<T extends SentryLikeEvent>(event: T): T {
  const e: SentryLikeEvent = event;
  if (e.request) {
    if (e.request.headers) {
      for (const key of Object.keys(e.request.headers)) {
        if (SENSITIVE_HEADERS.includes(key.toLowerCase())) e.request.headers[key] = '[redacted]';
      }
    }
    delete e.request.cookies;
    delete e.request.data;
    if (typeof e.request.query_string === 'string') {
      const params = new URLSearchParams(e.request.query_string);
      for (const key of SENSITIVE_QUERY) if (params.has(key)) params.set(key, '[redacted]');
      e.request.query_string = params.toString();
    }
    if (e.request.url) {
      e.request.url = e.request.url.replace(/([?&](code|token|state)=)[^&]*/g, '$1[redacted]');
    }
  }
  delete e.user;
  if (typeof e.message === 'string') e.message = scrubString(e.message);
  for (const ex of e.exception?.values ?? []) if (ex.value) ex.value = scrubString(ex.value);
  for (const crumb of e.breadcrumbs ?? []) {
    if (crumb.message) crumb.message = scrubString(crumb.message);
    if (crumb.data) delete crumb.data.headers;
  }
  return event;
}

export async function initSentry(env: AppEnv): Promise<boolean> {
  if (!env.SENTRY_DSN) return false;
  const Sentry = await import('@sentry/node');
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    release: `tradeos-backend@${process.env.npm_package_version ?? 'dev'}`,
    sendDefaultPii: false,
    tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE,
    maxBreadcrumbs: 30,
    beforeSend: (event) => scrubEvent(event),
    beforeBreadcrumb: (crumb) => {
      if (crumb.category === 'http' && crumb.data) delete crumb.data.headers;
      if (crumb.message) crumb.message = scrubString(crumb.message);
      return crumb;
    },
  });
  // Handed to the exception filter without a hard import, so the SDK stays lazy.
  (globalThis as { __tradeosSentry?: { captureException(e: unknown): void } }).__tradeosSentry = {
    captureException: (e) => Sentry.captureException(e),
  };
  return true;
}
