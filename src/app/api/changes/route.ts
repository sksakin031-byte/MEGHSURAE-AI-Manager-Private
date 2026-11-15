import { z } from "zod";
import { route, readJson } from "@/lib/api";
import { applyDirect, listChanges, proposeChange } from "@/services/changes";
import type { ChangeStatus } from "@/types";

const STATUSES = ["PENDING", "EXECUTING", "EXECUTED", "REJECTED", "FAILED", "UNCERTAIN"] as const;

export const GET = route({}, async ({ req, user }) => {
  const s = req.nextUrl.searchParams.get("status");
  const status = (STATUSES as readonly string[]).includes(s ?? "") ? (s as ChangeStatus) : undefined;
  return { changes: await listChanges(user, status, 100) };
});

const body = z.object({
  change: z.unknown(),
  mode: z.enum(["propose", "apply"]).default("propose"),
  confirm: z.boolean().optional(),
});

/** propose: prepare a pending change (Approval or Write mode). apply: propose + execute at once (Write mode + confirm only). */
export const POST = route({ perMinute: 30 }, async ({ req, user }) => {
  const input = body.parse(await readJson(req));
  const change =
    input.mode === "apply"
      ? await applyDirect(user, input.change, { actor: "user", confirmed: input.confirm === true })
      : await proposeChange(user, input.change, "ui");
  return { change };
});
