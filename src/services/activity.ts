import { db } from "@/lib/db";

export async function logActivity(userId: string, action: string, detail: string, source: "ui" | "mcp" | "system" = "ui", ok = true): Promise<void> {
  try {
    await db.activityLog.create({ data: { userId, action, detail: detail.slice(0, 1000), source, ok } });
  } catch {
    // Logging must never break the main flow.
  }
}

export async function listActivity(userId: string, limit = 100) {
  const rows = await db.activityLog.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: Math.min(limit, 300) });
  return rows.map((r) => ({ id: r.id, action: r.action, detail: r.detail, source: r.source, ok: r.ok, createdAt: r.createdAt.toISOString() }));
}
