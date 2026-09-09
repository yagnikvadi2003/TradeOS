import { type INestApplication, VersioningType } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
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
  app.setGlobalPrefix('api', { exclude: ['health', 'health/live', 'health/ready'] });
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

  if (env.SWAGGER_ENABLED && env.NODE_ENV !== 'production') {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('TradeOS API')
        .setDescription('Indian market option-chain terminal — v1 REST contract')
        .setVersion('1')
        .build(),
    );
    SwaggerModule.setup('api/docs', app, document, { jsonDocumentUrl: 'api/docs.json' });
  }
  return app;
}
