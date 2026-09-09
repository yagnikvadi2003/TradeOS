import 'dotenv/config';
import { defineConfig } from 'prisma/config';

/**
 * Prisma 7 configuration. Migrations and generation are driven by this file
 * (the schema no longer carries a datasource URL). `DATABASE_URL` is read from
 * the environment only; it is never committed.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'node --import tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? 'postgresql://tradeos:tradeos@localhost:5432/tradeos',
  },
});
