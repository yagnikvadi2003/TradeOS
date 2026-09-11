import { randomUUID } from 'node:crypto';
import { type IncomingMessage, type ServerResponse } from 'node:http';
import { Module } from '@nestjs/common';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import { APP_ENV, type AppEnv } from '@/common/config/env';

/**
 * Structured Pino logging.
 *
 * - Request ID: taken from a well-formed inbound `X-Request-Id` (so a proxy or
 *   the browser can correlate), otherwise generated; always echoed back as
 *   `X-Request-Id`. nestjs-pino binds it to every log line emitted while the
 *   request is in flight (AsyncLocalStorage), including module/service logs.
 * - Correlation ID: optional `X-Correlation-Id` propagated as `correlationId`
 *   for multi-hop traces.
 * - Credential-bearing headers and OAuth query values are redacted; success
 *   lines are silent in production unless HTTP_REQUEST_LOGGING=true.
 */
const ID_PATTERN = /^[A-Za-z0-9._-]{8,128}$/;

function headerId(req: IncomingMessage, name: string): string | undefined {
  const raw = req.headers[name];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value && ID_PATTERN.test(value) ? value : undefined;
}

@Module({
  imports: [
    PinoLoggerModule.forRootAsync({
      inject: [APP_ENV],
      useFactory: (env: AppEnv) => ({
        pinoHttp: {
          level: env.LOG_LEVEL,
          genReqId: (req: IncomingMessage, res: ServerResponse) => {
            const id = headerId(req, 'x-request-id') ?? randomUUID();
            res.setHeader('X-Request-Id', id);
            return id;
          },
          customProps: (req: IncomingMessage) => {
            const correlationId = headerId(req, 'x-correlation-id');
            return correlationId ? { correlationId } : {};
          },
          base: { service: 'tradeos-backend', version: env.APP_VERSION, env: env.NODE_ENV },
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'req.headers["x-operator-key"]',
              'res.headers["set-cookie"]',
            ],
            remove: true,
          },
          // Only what is needed to trace a request: no header dumps, no bodies.
          serializers: {
            req: (req: { id?: unknown; method?: string; url?: string }) => ({
              id: req.id,
              method: req.method,
              // OAuth callbacks carry single-use codes in the query string; never log them.
              url: req.url?.replace(/([?&](code|state|token)=)[^&]*/g, '$1[redacted]'),
            }),
            res: (res: { statusCode?: number }) => ({ statusCode: res.statusCode }),
          },
          autoLogging:
            env.HTTP_REQUEST_LOGGING === false
              ? false
              : {
                  ignore: (req) => (req.url ?? '').startsWith('/health') || req.url === '/metrics',
                },
          customLogLevel: (_req, res, err) => {
            if (err || res.statusCode >= 500) return 'error';
            if (res.statusCode >= 400) return 'warn';
            // Success lines cost CPU on a small host: opt-in in production.
            const verbose = env.HTTP_REQUEST_LOGGING ?? env.NODE_ENV !== 'production';
            return verbose ? 'info' : 'silent';
          },
          ...(env.NODE_ENV === 'development'
            ? { transport: { target: 'pino-pretty', options: { singleLine: true } } }
            : {}),
        },
      }),
    }),
  ],
  exports: [PinoLoggerModule],
})
export class LoggerModule {}
