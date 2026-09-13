-- CreateEnum
CREATE TYPE "AlertCondition" AS ENUM ('PRICE_ABOVE', 'PRICE_BELOW', 'CHANGE_PERCENT_ABOVE', 'CHANGE_PERCENT_BELOW', 'VOLUME_ABOVE', 'OI_CHANGE_ABOVE', 'IV_ABOVE', 'IV_BELOW', 'PCR_ABOVE', 'PCR_BELOW');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('ACTIVE', 'TRIGGERED', 'DISABLED');

-- CreateEnum
CREATE TYPE "CalendarDayKind" AS ENUM ('HOLIDAY', 'SPECIAL_SESSION');

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "watchlists" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "watchlists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "watchlist_items" (
    "id" UUID NOT NULL,
    "watchlistId" UUID NOT NULL,
    "instrumentKey" VARCHAR(96) NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "watchlist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "instrumentKey" VARCHAR(96) NOT NULL,
    "condition" "AlertCondition" NOT NULL,
    "threshold" DECIMAL(18,6) NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'ACTIVE',
    "repeat" BOOLEAN NOT NULL DEFAULT false,
    "note" VARCHAR(160),
    "triggeredAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "alertId" UUID,
    "title" VARCHAR(120) NOT NULL,
    "body" VARCHAR(400) NOT NULL,
    "value" DECIMAL(18,6),
    "readAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "preferences" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_calendar_days" (
    "id" UUID NOT NULL,
    "exchangeCode" "ExchangeCode" NOT NULL,
    "date" DATE NOT NULL,
    "kind" "CalendarDayKind" NOT NULL,
    "description" VARCHAR(120) NOT NULL,
    "openMinutes" INTEGER,
    "closeMinutes" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "market_calendar_days_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sessions_expiresAt_idx" ON "sessions"("expiresAt");

-- CreateIndex
CREATE INDEX "watchlists_sessionId_position_idx" ON "watchlists"("sessionId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "watchlists_sessionId_name_key" ON "watchlists"("sessionId", "name");

-- CreateIndex
CREATE INDEX "watchlist_items_watchlistId_position_idx" ON "watchlist_items"("watchlistId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "watchlist_items_watchlistId_instrumentKey_key" ON "watchlist_items"("watchlistId", "instrumentKey");

-- CreateIndex
CREATE INDEX "alerts_sessionId_status_idx" ON "alerts"("sessionId", "status");

-- CreateIndex
CREATE INDEX "alerts_status_instrumentKey_idx" ON "alerts"("status", "instrumentKey");

-- CreateIndex
CREATE INDEX "notifications_sessionId_createdAt_idx" ON "notifications"("sessionId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "preferences_sessionId_key_key" ON "preferences"("sessionId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "market_calendar_days_exchangeCode_date_key" ON "market_calendar_days"("exchangeCode", "date");

-- AddForeignKey
ALTER TABLE "watchlists" ADD CONSTRAINT "watchlists_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_watchlistId_fkey" FOREIGN KEY ("watchlistId") REFERENCES "watchlists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "alerts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preferences" ADD CONSTRAINT "preferences_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
