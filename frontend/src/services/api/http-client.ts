import { type ZodType } from 'zod';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly url: string,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface HttpClientOptions {
  readonly baseUrl: string;
  readonly timeoutMs?: number;
  readonly fetchImpl?: typeof fetch;
}

/**
 * Minimal typed fetch wrapper. Every response is validated against a Zod
 * schema at the boundary so the UI never trusts raw JSON shapes.
 */
export class HttpClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: HttpClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
  }

  async get<T>(path: string, schema: ZodType<T>, signal?: AbortSignal): Promise<T> {
    const url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort, { once: true });

    try {
      const response = await this.fetchImpl(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new ApiError(`Request failed with status ${response.status}`, response.status, url);
      }
      const json: unknown = await response.json();
      const parsed = schema.safeParse(json);
      if (!parsed.success) {
        throw new ApiError('Response failed schema validation', response.status, url, json);
      }
      return parsed.data;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }
}
