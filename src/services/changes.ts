import type { PendingChange } from "@prisma/client";
import { db } from "@/lib/db";
import { AppError, badRequest, conflict, forbidden, notFound } from "@/lib/errors";
import { canExecute, canPropose, isMode, type Actor } from "@/lib/permissions";
import { parseChangeInput, type ChangeInput } from "@/lib/changes-schema";
import { logActivity } from "@/services/activity";
import { invalidateUserCache } from "@/services/insights";
import * as yt from "@/services/youtube";
import type { ChangeKind, ChangeRecord, ChangeStatus, SessionUser } from "@/types";

type Json = Record<string, unknown>;

export function toRecord(c: PendingChange): ChangeRecord {
  return {
    id: c.id,
    kind: c.kind as ChangeKind,
    targetId: c.targetId,
    summary: c.summary,
    before: c.beforeJson === "null" ? null : (JSON.parse(c.beforeJson) as Json),
    after: JSON.parse(c.afterJson) as Json,
    status: c.status as ChangeStatus,
    source: c.source === "mcp" ? "mcp" : "ui",
    createdAt: c.createdAt.toISOString(),
    decidedAt: c.decidedAt?.toISOString() ?? null,
    executedAt: c.executedAt?.toISOString() ?? null,
    error: c.error,
  };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const playlistAddLocks = new Map<string, Promise<void>>();

async function withPlaylistAddLock<T>(key: string, work: () => Promise<T>): Promise<T> {
  const previous = playlistAddLocks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  playlistAddLocks.set(key, current);
  await previous.catch(() => undefined);
  try {
    return await work();
  } finally {
    release();
    if (playlistAddLocks.get(key) === current) playlistAddLocks.delete(key);
  }
}

/** Always read the permission mode fresh from the database (the session object could be stale). */
async function freshMode(userId: string) {
  const u = await db.user.findUnique({ where: { id: userId }, select: { permissionMode: true, grantedScopes: true } });
  if (!u) throw notFound("User not found.");
  return { mode: isMode(u.permissionMode) ? u.permissionMode : "READ", scopes: u.grantedScopes.split(" ") };
}

export async function proposeChange(user: SessionUser, raw: unknown, source: "ui" | "mcp"): Promise<ChangeRecord> {
  const { mode, scopes } = await freshMode(user.id);
  const gate = canPropose(mode);
  if (!gate.allowed) throw forbidden(gate.reason);
  if (!scopes.includes("https://www.googleapis.com/auth/youtube.force-ssl")) {
    throw forbidden("Your Google connection is read-only. Reconnect with edit access in Settings before preparing changes.");
  }
  const input: ChangeInput = parseChangeInput(raw);

  let before: Json | null = null;
  let after: Json;
  let summary: string;
  let targetId: string | null = null;

  switch (input.kind) {
    case "video_metadata": {
      const v = await yt.getVideo(user.id, input.videoId);
      before = {};
      after = {};
      if (input.title !== undefined) { before.title = v.title; after.title = input.title; }
      if (input.description !== undefined) { before.description = v.description; after.description = input.description; }
      if (input.tags !== undefined) { before.tags = v.tags; after.tags = input.tags; }
      if (same(before, after)) throw badRequest("The proposed values are identical to the current ones.");
      targetId = input.videoId;
      summary = `Update ${Object.keys(after).join(", ")} of video "${v.title.slice(0, 60)}"`;
      break;
    }
    case "playlist_create": {
      after = { title: input.title, description: input.description, privacy: input.privacy };
      summary = `Create ${input.privacy} playlist "${input.title}"`;
      break;
    }
    case "playlist_update": {
      const p = await yt.getPlaylist(user.id, input.playlistId);
      before = {};
      after = {};
      if (input.title !== undefined) { before.title = p.title; after.title = input.title; }
      if (input.description !== undefined) { before.description = p.description; after.description = input.description; }
      if (same(before, after)) throw badRequest("The proposed values are identical to the current ones.");
      targetId = input.playlistId;
      summary = `Update ${Object.keys(after).join(", ")} of playlist "${p.title}"`;
      break;
    }
    case "playlist_add_video": {
      const [p, v, ids] = await Promise.all([yt.getPlaylist(user.id, input.playlistId), yt.getVideo(user.id, input.videoId), yt.listPlaylistVideoIds(user.id, input.playlistId)]);
      if (ids.includes(input.videoId)) throw conflict("That video is already in the playlist.");
      after = { playlistId: input.playlistId, videoId: input.videoId };
      targetId = input.playlistId;
      summary = `Add "${v.title.slice(0, 60)}" to playlist "${p.title}"`;
      break;
    }
    default:
      throw badRequest("Unsupported change kind.");
  }

  const row = await db.pendingChange.create({
    data: { userId: user.id, kind: input.kind, targetId, summary, beforeJson: JSON.stringify(before), afterJson: JSON.stringify(after), source },
  });
  await logActivity(user.id, "change.proposed", summary, source);
  return toRecord(row);
}

async function assertNoDrift(userId: string, c: PendingChange): Promise<void> {
  const before = c.beforeJson === "null" ? null : (JSON.parse(c.beforeJson) as Json);
  if (!before || !c.targetId) return;
  if (c.kind === "video_metadata") {
    const v = await yt.getVideo(userId, c.targetId);
    for (const k of Object.keys(before)) {
      if (!same((v as unknown as Json)[k], before[k])) throw conflict(`The video's ${k} changed on YouTube after this proposal. Create a new proposal.`);
    }
  } else if (c.kind === "playlist_update") {
    const p = await yt.getPlaylist(userId, c.targetId);
    for (const k of Object.keys(before)) {
      if (!same((p as unknown as Json)[k], before[k])) throw conflict(`The playlist's ${k} changed on YouTube after this proposal. Create a new proposal.`);
    }
  } else if (c.kind === "playlist_add_video") {
    const after = JSON.parse(c.afterJson) as Json;
    const ids = await yt.listPlaylistVideoIds(userId, c.targetId);
    if (ids.includes(after.videoId as string)) throw conflict("That video is already in the playlist or another change applied it first.");
  }
}

async function assertNoConcurrentPlaylistAdd(userId: string, c: PendingChange): Promise<void> {
  if (c.kind !== "playlist_add_video" || !c.targetId) return;
  const after = JSON.parse(c.afterJson) as Json;
  const active = await db.pendingChange.findMany({
    where: { userId, kind: "playlist_add_video", targetId: c.targetId, status: { in: ["PENDING", "EXECUTING"] } },
    select: { id: true, afterJson: true },
  });
  for (const other of active) {
    if (other.id === c.id) continue;
    const otherAfter = JSON.parse(other.afterJson) as Json;
    if (otherAfter.videoId === after.videoId) throw conflict("Another pending change is already adding this video to the playlist.");
  }
}

async function run(userId: string, c: PendingChange): Promise<string> {
  const after = JSON.parse(c.afterJson) as Json;
  switch (c.kind) {
    case "video_metadata":
      await yt.updateVideoMetadata(userId, c.targetId!, after as { title?: string; description?: string; tags?: string[] });
      return "Video metadata updated.";
    case "playlist_create": {
      const r = await yt.createPlaylist(userId, after as { title: string; description: string; privacy: "private" | "unlisted" | "public" });
      return `Playlist created (${r.id}).`;
    }
    case "playlist_update":
      await yt.updatePlaylist(userId, c.targetId!, after as { title?: string; description?: string });
      return "Playlist updated.";
    case "playlist_add_video":
      await yt.addVideoToPlaylist(userId, after.playlistId as string, after.videoId as string);
      return "Video added to playlist.";
    default:
      throw badRequest("Unsupported change kind.");
  }
}

export async function executeChange(
  user: SessionUser,
  changeId: string,
  opts: { actor: Actor; confirmed: boolean; viaApproval: boolean },
): Promise<ChangeRecord> {
  const { mode } = await freshMode(user.id);
  const decision = canExecute({ mode, actor: opts.actor, confirmed: opts.confirmed, viaApproval: opts.viaApproval });
  if (!decision.allowed) throw forbidden(decision.reason);

  const change = await db.pendingChange.findFirst({ where: { id: changeId, userId: user.id } });
  if (!change) throw notFound("Change not found.");
  if (change.status !== "PENDING") throw conflict(`This change is already ${change.status.toLowerCase()}.`);

  // Atomic claim: prevents double execution from concurrent requests.
  const claimed = await db.pendingChange.updateMany({ where: { id: changeId, userId: user.id, status: "PENDING" }, data: { status: "EXECUTING", decidedAt: new Date() } });
  if (claimed.count !== 1) throw conflict("This change is already being processed.");

  try {
    const execute = async () => {
      await assertNoConcurrentPlaylistAdd(user.id, change);
      await assertNoDrift(user.id, change);
      return run(user.id, change);
    };
    const msg = change.kind === "playlist_add_video"
      ? await withPlaylistAddLock(`${user.id}:${change.targetId}:${JSON.parse(change.afterJson).videoId}`, execute)
      : await execute();
    const done = await db.pendingChange.update({ where: { id: changeId }, data: { status: "EXECUTED", executedAt: new Date(), error: null } });
    invalidateUserCache(user.id);
    await logActivity(user.id, "change.executed", `${change.summary} — ${msg}`, opts.actor === "mcp" ? "mcp" : "ui");
    return toRecord(done);
  } catch (e) {
    const message = e instanceof AppError || e instanceof Error ? e.message : "Unknown error";
    // A drift conflict means nothing was written: return it to PENDING. A network,
    // timeout, or 5xx failure is different: YouTube may have accepted the write
    // before the response was lost, so never make it retryable automatically.
    const drift = e instanceof AppError && e.status === 409;
    const uncertain = !drift && ((e instanceof AppError && e.status >= 500) || e instanceof TypeError || (e instanceof Error && /timeout|fetch|network|socket/i.test(e.message)));
    await db.pendingChange.update({ where: { id: changeId }, data: { status: drift ? "PENDING" : uncertain ? "UNCERTAIN" : "FAILED", error: ((uncertain ? "YouTube operation outcome is unknown; verify the channel before creating a new proposal. " : "") + message).slice(0, 500) } });
    await logActivity(user.id, "change.failed", `${change.summary} — ${message}`, opts.actor === "mcp" ? "mcp" : "ui", false);
    throw e;
  }
}

export async function rejectChange(user: SessionUser, changeId: string): Promise<ChangeRecord> {
  const change = await db.pendingChange.findFirst({ where: { id: changeId, userId: user.id } });
  if (!change) throw notFound("Change not found.");
  const rejected = await db.pendingChange.updateMany({
    where: { id: changeId, userId: user.id, status: "PENDING" },
    data: { status: "REJECTED", decidedAt: new Date() },
  });
  if (rejected.count !== 1) throw conflict(`This change is already ${change.status.toLowerCase()}.`);
  const row = await db.pendingChange.findUniqueOrThrow({ where: { id: changeId } });
  await logActivity(user.id, "change.rejected", change.summary, "ui");
  return toRecord(row);
}

/** Propose + execute in one step. Only allowed in WRITE mode and always needs confirmed === true. */
export async function applyDirect(user: SessionUser, raw: unknown, opts: { actor: Actor; confirmed: boolean }): Promise<ChangeRecord> {
  const { mode } = await freshMode(user.id);
  const gate = canExecute({ mode, actor: opts.actor, confirmed: opts.confirmed, viaApproval: false });
  if (!gate.allowed) throw forbidden(gate.reason);
  const proposal = await proposeChange(user, raw, opts.actor === "mcp" ? "mcp" : "ui");
  return executeChange(user, proposal.id, { ...opts, viaApproval: false });
}

/** Creates a NEW pending proposal that restores the values captured before an executed change. */
export async function proposeRevert(user: SessionUser, changeId: string): Promise<ChangeRecord> {
  const c = await db.pendingChange.findFirst({ where: { id: changeId, userId: user.id } });
  if (!c) throw notFound("Change not found.");
  if (c.status !== "EXECUTED") throw badRequest("Only executed changes can be reverted.");
  const before = c.beforeJson === "null" ? null : (JSON.parse(c.beforeJson) as Json);
  if (!before || !c.targetId || (c.kind !== "video_metadata" && c.kind !== "playlist_update")) {
    throw badRequest("This kind of change cannot be reverted automatically.");
  }
  const raw = c.kind === "video_metadata" ? { kind: c.kind, videoId: c.targetId, ...before } : { kind: c.kind, playlistId: c.targetId, ...before };
  const rec = await proposeChange(user, raw, "ui");
  await logActivity(user.id, "change.revert_proposed", `Revert of: ${c.summary}`, "ui");
  return rec;
}

export async function listChanges(user: SessionUser, status?: ChangeStatus, limit = 50): Promise<ChangeRecord[]> {
  const rows = await db.pendingChange.findMany({
    where: { userId: user.id, ...(status ? { status } : {}) },
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 200),
  });
  return rows.map(toRecord);
}
