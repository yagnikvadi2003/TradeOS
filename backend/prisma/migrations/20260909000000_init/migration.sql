-- CreateEnum
CREATE TYPE "ExchangeCode" AS ENUM ('NSE', 'BSE');

-- CreateEnum
CREATE TYPE "InstrumentSegment" AS ENUM ('INDEX', 'OPTION');

-- CreateEnum
CREATE TYPE "InstrumentKind" AS ENUM ('EQUITY_INDEX', 'VOLATILITY_INDEX');

-- CreateEnum
CREATE TYPE "OptionType" AS ENUM ('CE', 'PE');

-- CreateEnum
CREATE TYPE "ExpiryCycle" AS ENUM ('WEEKLY', 'MONTHLY', 'QUARTERLY');

-- CreateTable
CREATE TABLE "instruments" (
    "id" UUID NOT NULL,
    "instrumentKey" VARCHAR(64) NOT NULL,
    "symbol" VARCHAR(32) NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "exchangeCode" "ExchangeCode" NOT NULL,
    "segment" "InstrumentSegment" NOT NULL DEFAULT 'INDEX',
    "kind" "InstrumentKind" NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "tickSize" DECIMAL(12,6) NOT NULL,
    "lotSize" INTEGER,
    "strikeStep" DECIMAL(12,4),
    "hasOptionChain" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "instruments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expiries" (
    "id" UUID NOT NULL,
    "instrumentId" UUID NOT NULL,
    "expiryDate" DATE NOT NULL,
    "cycle" "ExpiryCycle" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "expiries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "option_instruments" (
    "id" UUID NOT NULL,
    "contractKey" VARCHAR(96) NOT NULL,
    "instrumentId" UUID NOT NULL,
    "expiryId" UUID NOT NULL,
    "exchangeCode" "ExchangeCode" NOT NULL,
    "tradingSymbol" VARCHAR(64) NOT NULL,
    "strike" DECIMAL(14,4) NOT NULL,
    "optionType" "OptionType" NOT NULL,
    "lotSize" INTEGER NOT NULL,
    "tickSize" DECIMAL(12,6) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "option_instruments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_instrument_mappings" (
    "id" UUID NOT NULL,
    "provider" VARCHAR(32) NOT NULL,
    "providerSymbol" VARCHAR(128) NOT NULL,
    "instrumentId" UUID,
    "optionInstrumentId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "provider_instrument_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "instruments_instrumentKey_key" ON "instruments"("instrumentKey");

-- CreateIndex
CREATE INDEX "instruments_exchangeCode_kind_idx" ON "instruments"("exchangeCode", "kind");

-- CreateIndex
CREATE INDEX "instruments_hasOptionChain_isActive_idx" ON "instruments"("hasOptionChain", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "instruments_exchangeCode_symbol_key" ON "instruments"("exchangeCode", "symbol");

-- CreateIndex
CREATE INDEX "expiries_instrumentId_isActive_expiryDate_idx" ON "expiries"("instrumentId", "isActive", "expiryDate");

-- CreateIndex
CREATE UNIQUE INDEX "expiries_instrumentId_expiryDate_key" ON "expiries"("instrumentId", "expiryDate");

-- CreateIndex
CREATE UNIQUE INDEX "option_instruments_contractKey_key" ON "option_instruments"("contractKey");

-- CreateIndex
CREATE INDEX "option_instruments_instrumentId_expiryId_idx" ON "option_instruments"("instrumentId", "expiryId");

-- CreateIndex
CREATE INDEX "option_instruments_exchangeCode_tradingSymbol_idx" ON "option_instruments"("exchangeCode", "tradingSymbol");

-- CreateIndex
CREATE UNIQUE INDEX "option_instruments_expiryId_strike_optionType_key" ON "option_instruments"("expiryId", "strike", "optionType");

-- CreateIndex
CREATE UNIQUE INDEX "provider_instrument_mappings_provider_providerSymbol_key" ON "provider_instrument_mappings"("provider", "providerSymbol");

-- CreateIndex
CREATE UNIQUE INDEX "provider_instrument_mappings_provider_instrumentId_key" ON "provider_instrument_mappings"("provider", "instrumentId");

-- CreateIndex
CREATE UNIQUE INDEX "provider_instrument_mappings_provider_optionInstrumentId_key" ON "provider_instrument_mappings"("provider", "optionInstrumentId");

-- AddForeignKey
ALTER TABLE "expiries" ADD CONSTRAINT "expiries_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "instruments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "option_instruments" ADD CONSTRAINT "option_instruments_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "instruments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "option_instruments" ADD CONSTRAINT "option_instruments_expiryId_fkey" FOREIGN KEY ("expiryId") REFERENCES "expiries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_instrument_mappings" ADD CONSTRAINT "provider_instrument_mappings_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "instruments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_instrument_mappings" ADD CONSTRAINT "provider_instrument_mappings_optionInstrumentId_fkey" FOREIGN KEY ("optionInstrumentId") REFERENCES "option_instruments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
