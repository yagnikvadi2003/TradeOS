-- CreateTable
CREATE TABLE "provider_credentials" (
    "id" UUID NOT NULL,
    "provider" VARCHAR(32) NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "iv" VARCHAR(32) NOT NULL,
    "tag" VARCHAR(32) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "provider_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "provider_credentials_provider_key" ON "provider_credentials"("provider");
