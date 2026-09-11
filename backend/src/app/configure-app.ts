import { type INestApplication, VersioningType } from '@nestjs/common';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { APP_ENV, type AppEnv } from '@/common/config/env';

/**
 * Application-level wiring shared by `main.ts` and API tests: URL versioning
 * (`/api/v1/...`), security headers, strict CORS, body limits, OpenAPI.
 */
export function configureApp(app: INestApplication): INestApplication {
  const env = app.get<AppEnv>(APP_ENV);
  app.useLogger(app.get(Logger));
  app.setGlobalPrefix('api', { exclude: ['health', 'health/live', 'health/ready', 'metrics'] });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.use(helmet({ contentSecurityPolicy: env.NODE_ENV === 'production' }));
  app.enableCors({
    origin: env.CORS_ORIGINS.split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    methods: ['GET', 'HEAD', 'OPTIONS'],
    credentials: true,
    maxAge: 600,
  });
  app.enableShutdownHooks();

  if (env.SWAGGER_ENABLED) {
    SwaggerModule.setup('api/docs', app, createOpenApiDocument(app), {
      jsonDocumentUrl: 'api/docs.json',
      customSiteTitle: 'TradeOS API',
      swaggerOptions: { persistAuthorization: false, displayRequestDuration: true },
    });
  }
  return app;
}

/**
 * The OpenAPI document (also exported by `scripts/export-openapi.cjs`).
 * Swagger UI is environment-configurable: on by default outside production,
 * off in production unless SWAGGER_ENABLED=true is set explicitly.
 */
export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  return SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('TradeOS API')
      .setDescription(
        [
          'Indian market option-chain terminal — REST contract v1.',
          'Every response is JSON. Errors share one envelope: `{ "error": { "code", "message", "details?" } }`.',
          'Realtime market data does not use REST: see the WebSocket protocol in `docs/websocket-protocol.md` (`/ws/market`).',
          'Instrument keys are TradeOS-owned (`NSE:INDEX:NIFTY50`, `NSE:OPT:NIFTY50:2026-09-15:24000:CE`); provider symbols never appear in this API.',
        ].join('\n\n'),
      )
      .setVersion('1.0')
      .addTag('market', 'Index quotes (REST seed for live headers)')
      .addTag('option-chain', 'Metadata, expiries and snapshots for option-chain instruments')
      .addTag('realtime', 'Session tokens for the market WebSocket')
      .addTag('operator', 'Provider credential operations — X-Operator-Key required')
      .addTag('health', 'Liveness, readiness and overview')
      .addTag('metrics', 'Prometheus exposition')
      .addApiKey({ type: 'apiKey', in: 'header', name: 'X-Operator-Key' }, 'operator-key')
      .build(),
  );
}
