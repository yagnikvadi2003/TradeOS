import { env } from '@/app/config/env';

const TOKEN_LIKE =
  /(eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,})|(Bearer\s+[A-Za-z0-9._-]{16,})/g;

export function scrubString(value: string): string {
  return value.replace(TOKEN_LIKE, '[redacted]');
}

interface EventLike {
  request?: { url?: string; headers?: Record<string, string>; cookies?: unknown };
  user?: unknown;
  message?: string;
  exception?: { values?: { value?: string }[] };
  breadcrumbs?: { message?: string; data?: Record<string, unknown> }[];
}

/** Strip anything credential-shaped before an event leaves the browser. */
export function scrubEvent<T extends EventLike>(event: T): T {
  const e: EventLike = event;
  if (e.request) {
    delete e.request.headers;
    delete e.request.cookies;
    if (e.request.url) {
      e.request.url = e.request.url.replace(/([?&](code|token|state)=)[^&]*/g, '$1[redacted]');
    }
  }
  delete e.user;
  if (e.message) e.message = scrubString(e.message);
  for (const ex of e.exception?.values ?? []) if (ex.value) ex.value = scrubString(ex.value);
  for (const crumb of e.breadcrumbs ?? []) {
    if (crumb.message) crumb.message = scrubString(crumb.message);
    // fetch/xhr breadcrumbs: keep the path only, drop headers/bodies/query strings.
    if (crumb.data) {
      delete crumb.data.headers;
      delete crumb.data.body;
      delete crumb.data.response;
      const url = crumb.data.url;
      if (typeof url === 'string') crumb.data.url = url.split('?')[0];
    }
  }
  return event;
}

/**
 * Browser error tracking, lazily loaded only when a DSN is configured so the
 * SDK never ships to users who don't need it. No PII, no session replay,
 * no performance tracing by default.
 */
export async function initBrowserSentry(): Promise<boolean> {
  if (!env.VITE_SENTRY_DSN || !import.meta.env.PROD) return false;
  const Sentry = await import('@sentry/react');
  Sentry.init({
    dsn: env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    release: `tradeos-frontend@${env.VITE_APP_VERSION ?? 'dev'}`,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    maxBreadcrumbs: 20,
    beforeSend: (event) => scrubEvent(event),
    beforeBreadcrumb: (crumb) => (crumb.category === 'console' ? null : crumb),
  });
  return true;
}
