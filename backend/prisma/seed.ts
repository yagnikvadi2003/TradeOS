/**
 * Seeds the six-index instrument catalog. Idempotent (upsert on
 * instrumentKey). Expiries and contracts are populated lazily from the
 * provider by the option-chain service, never seeded by hand.
 *
 *   DATABASE_URL=postgresql://… pnpm --filter @tradeos/backend prisma:seed
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { INSTRUMENT_CATALOG } from '../src/modules/instruments/instrument.catalog';
import { PrismaOptionChainRepository } from '../src/modules/option-chain/repositories/prisma-option-chain.repository';

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required to seed');
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    await new PrismaOptionChainRepository(prisma).upsertInstruments(INSTRUMENT_CATALOG);
    console.log(`Seeded ${INSTRUMENT_CATALOG.length} instruments`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
