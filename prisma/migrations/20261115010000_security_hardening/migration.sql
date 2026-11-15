-- AlterTable
ALTER TABLE "OAuthState" ADD COLUMN "consumedAt" DATETIME;

-- CreateTable
CREATE TABLE "McpCredential" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tokenHash" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "revokedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" DATETIME
);

-- CreateIndex
CREATE UNIQUE INDEX "McpCredential_tokenHash_key" ON "McpCredential"("tokenHash");

-- CreateIndex
CREATE INDEX "McpCredential_clientId_idx" ON "McpCredential"("clientId");

-- CreateIndex
CREATE INDEX "McpCredential_expiresAt_idx" ON "McpCredential"("expiresAt");

