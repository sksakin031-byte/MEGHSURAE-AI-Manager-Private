import { z } from "zod";
import { route, readJson } from "@/lib/api";
import { executeChange, proposeRevert, rejectChange } from "@/services/changes";

const body = z.object({ action: z.enum(["approve", "reject", "revert"]), confirm: z.boolean().optional() });

export const POST = route({ perMinute: 30 }, async ({ req, user, params }) => {
  const { action, confirm } = body.parse(await readJson(req));
  if (action === "approve") {
    // Only a signed-in user pressing Approve in the UI reaches this path (actor "user", viaApproval true).
    return { change: await executeChange(user, params.id, { actor: "user", confirmed: confirm === true, viaApproval: true }) };
  }
  if (action === "reject") return { change: await rejectChange(user, params.id) };
  return { change: await proposeRevert(user, params.id) };
});
