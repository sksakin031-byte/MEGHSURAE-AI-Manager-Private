import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";

// Pure helper retained for deterministic unit tests. Production routes use
// databaseRateLimit so all server instances share the same decision state.
const buckets = new Map<string, number[]>();

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): { ok: boolean; retryAfterSec: number } {
  const cutoff = now - windowMs;
  const hits = (buckets.get(key) ?? []).filter((t) => t > cutoff);
  if (hits.length >= limit) {
    buckets.set(key, hits);
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((hits[0] + windowMs - now) / 1000)) };
  }
  hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) if (v.every((t) => t <= cutoff)) buckets.delete(k);
  }
  return { ok: true, retryAfterSec: 0 };
}

/** Shared sliding-window limiter for multi-instance deployments. */
export async function databaseRateLimit(key: string, limit: number, windowMs: number, now = Date.now()): Promise<{ ok: boolean; retryAfterSec: number }> {
  const cutoff = now - windowMs;
  const expiresAt = new Date(now + windowMs);
  let result: { ok: boolean; retryAfterSec: number } | undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      result = await db.$transaction(async (tx) => {
        const existing = await tx.rateLimitBucket.findUnique({ where: { key } });
        let parsed: unknown[] = [];
        if (existing && existing.expiresAt.getTime() > now) {
          try { parsed = JSON.parse(existing.hitsJson) as unknown[]; } catch { parsed = []; }
        }
        const hits = parsed.filter((v): v is number => typeof v === "number" && v > cutoff);
        if (hits.length >= limit) {
          const retryAfterSec = Math.max(1, Math.ceil((hits[0] + windowMs - now) / 1000));
          await tx.rateLimitBucket.upsert({ where: { key }, create: { key, hitsJson: JSON.stringify(hits), expiresAt }, update: { hitsJson: JSON.stringify(hits), expiresAt } });
          return { ok: false, retryAfterSec };
        }
        hits.push(now);
        await tx.rateLimitBucket.upsert({ where: { key }, create: { key, hitsJson: JSON.stringify(hits), expiresAt }, update: { hitsJson: JSON.stringify(hits), expiresAt } });
        return { ok: true, retryAfterSec: 0 };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      break;
    } catch (error) {
      const retryable = typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "P2034";
      if (!retryable || attempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 5 * (attempt + 1)));
    }
  }
  if (Math.random() < 0.01) await db.rateLimitBucket.deleteMany({ where: { expiresAt: { lt: new Date(now) } } }).catch(() => undefined);
  return result!;
}

export function resetRateLimits(): void {
  buckets.clear();
}
