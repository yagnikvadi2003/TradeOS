import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app/app.module';
import { configureApp } from './app/configure-app';
import { APP_ENV, type AppEnv } from './common/config/env';
import { loadDotenv } from './common/config/load-dotenv';
import { initSentry } from './infrastructure/observability/sentry';

async function bootstrap(): Promise<void> {
  loadDotenv(); // layered .env files; never overrides the real environment
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    bodyParser: true,
    rawBody: false,
  });
  app.useBodyParser('json', { limit: '64kb' });
  configureApp(app);
  const env = app.get<AppEnv>(APP_ENV);
  if (env.TRUST_PROXY) app.set('trust proxy', 1);
  const sentry = await initSentry(env);
  await app.listen(env.PORT, env.HOST);
  // Graceful shutdown: stop accepting, close clients (1001), stop the feed,
  // release the lease, flush Redis mirrors, disconnect Prisma — via Nest hooks.
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      app.get(Logger).log(`${signal} received; shutting down`);
      const timer = setTimeout(() => process.exit(1), 10_000);
      timer.unref();
      void app.close().then(() => process.exit(0));
    });
  }
  app
    .get(Logger)
    .log(
      `TradeOS backend listening on ${env.HOST}:${env.PORT} (provider=${env.MARKET_DATA_PROVIDER}, db=${env.DATABASE_URL ? 'postgres' : 'memory'}, redis=${env.REDIS_URL ? 'configured' : 'off'}, sentry=${sentry ? 'on' : 'off'})`,
    );
}

bootstrap().catch((error: unknown) => {
  console.error('Fatal startup error', error);
  process.exit(1);
});
