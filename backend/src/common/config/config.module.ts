import { Global, Module } from '@nestjs/common';
import { APP_ENV, loadEnv } from './env';

/** Loads and validates the environment once; injected via the `APP_ENV` token. */
@Global()
@Module({
  providers: [{ provide: APP_ENV, useFactory: () => loadEnv() }],
  exports: [APP_ENV],
})
export class ConfigModule {}
