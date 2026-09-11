/**
 * Writes the OpenAPI document to docs/openapi.json without listening on a
 * port. Runs against the compiled build (decorator metadata is emitted by
 * SWC, not by tsx), so `pnpm build` must precede it — as CI does.
 */
const { writeFileSync } = require('node:fs');
const { resolve } = require('node:path');

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.SWAGGER_ENABLED = 'true';

async function main() {
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('../dist/app/app.module.js');
  const { configureApp, createOpenApiDocument } = require('../dist/app/configure-app.js');
  const app = await NestFactory.create(AppModule, { logger: false });
  configureApp(app);
  const document = createOpenApiDocument(app);
  const out = resolve(__dirname, '..', '..', 'docs', 'openapi.json');
  writeFileSync(out, `${JSON.stringify(document, null, 2)}\n`);
  console.log(`OpenAPI written to ${out} (${Object.keys(document.paths).length} paths)`);
  await app.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
