import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app/app.module';
import { configureApp } from './app/configure-app';
import { APP_ENV, type AppEnv } from './common/config/env';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    bodyParser: true,
    rawBody: false,
  });
  app.useBodyParser('json', { limit: '64kb' });
  configureApp(app);
  const env = app.get<AppEnv>(APP_ENV);
  await app.listen(env.PORT, env.HOST);
  app
    .get(Logger)
    .log(
      `TradeOS backend listening on ${env.HOST}:${env.PORT} (provider=${env.MARKET_DATA_PROVIDER}, db=${env.DATABASE_URL ? 'postgres' : 'memory'})`,
    );
}

bootstrap().catch((error: unknown) => {
  console.error('Fatal startup error', error);
  process.exit(1);
});
