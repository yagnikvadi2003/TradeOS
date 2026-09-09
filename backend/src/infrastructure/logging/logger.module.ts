import { Module } from '@nestjs/common';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import { APP_ENV, type AppEnv } from '@/common/config/env';

/**
 * Structured Pino logging. Request logs are sampled down to warnings and
 * errors for the hot option-chain snapshot path to keep CPU low; headers
 * that could carry credentials are redacted.
 */
@Module({
  imports: [
    PinoLoggerModule.forRootAsync({
      inject: [APP_ENV],
      useFactory: (env: AppEnv) => ({
        pinoHttp: {
          level: env.LOG_LEVEL,
          redact: {
            paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
            remove: true,
          },
          // Only what is needed to trace a request: no header dumps, no bodies.
          serializers: {
            req: (req: { id?: unknown; method?: string; url?: string }) => ({
              id: req.id,
              method: req.method,
              url: req.url,
            }),
            res: (res: { statusCode?: number }) => ({ statusCode: res.statusCode }),
          },
          autoLogging: { ignore: (req) => (req.url ?? '').startsWith('/health') },
          customLogLevel: (_req, res, err) => {
            if (err || res.statusCode >= 500) return 'error';
            if (res.statusCode >= 400) return 'warn';
            return env.NODE_ENV === 'production' ? 'silent' : 'info';
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
