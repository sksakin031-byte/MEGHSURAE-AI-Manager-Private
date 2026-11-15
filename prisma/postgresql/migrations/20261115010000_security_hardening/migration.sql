ALTER TABLE "OAuthState" ADD COLUMN "consumedAt" TIMESTAMP(3);

CREATE TABLE "McpCredential" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    CONSTRAINT "McpCredential_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "McpCredential_tokenHash_key" ON "McpCredential"("tokenHash");
CREATE INDEX "McpCredential_clientId_idx" ON "McpCredential"("clientId");
CREATE INDEX "McpCredential_expiresAt_idx" ON "McpCredential"("expiresAt");
