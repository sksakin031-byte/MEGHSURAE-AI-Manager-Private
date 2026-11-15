import { db } from "@/lib/db";
import { randomToken, sha256Hex, safeEqual } from "@/lib/crypto";

const CREDENTIAL_TTL_MS = 60 * 60_000;

export function validClientId(value: string | null): value is string {
  return Boolean(value && value.length >= 3 && value.length <= 100 && /^[A-Za-z0-9._:-]+$/.test(value));
}

export async function issueMcpCredential(clientId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = `mcp_${randomToken(32)}`;
  const expiresAt = new Date(Date.now() + CREDENTIAL_TTL_MS);
  await db.mcpCredential.create({ data: { tokenHash: sha256Hex(token), clientId, expiresAt } });
  return { token, expiresAt };
}

export async function authenticateMcpCredential(token: string): Promise<boolean> {
  if (!token.startsWith("mcp_") || token.length > 160) return false;
  const credential = await db.mcpCredential.findUnique({ where: { tokenHash: sha256Hex(token) } });
  if (!credential || credential.revokedAt || credential.expiresAt.getTime() <= Date.now()) return false;
  // Hash lookup is the security boundary; this comparison also prevents accidental
  // acceptance if a database adapter ever returns a mismatched record.
  if (!safeEqual(sha256Hex(token), credential.tokenHash)) return false;
  await db.mcpCredential.update({ where: { id: credential.id }, data: { lastUsedAt: new Date() } });
  return true;
}

export async function revokeMcpCredentials(clientId: string): Promise<number> {
  const result = await db.mcpCredential.updateMany({ where: { clientId, revokedAt: null }, data: { revokedAt: new Date() } });
  return result.count;
}

export async function purgeExpiredMcpCredentials(): Promise<void> {
  await db.mcpCredential.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch(() => undefined);
}
