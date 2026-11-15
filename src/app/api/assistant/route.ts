import { z } from "zod";
import { route, readJson } from "@/lib/api";
import { assistantReply } from "@/services/ai-tasks";

const body = z.object({ message: z.string().trim().min(1).max(1500) });

export const POST = route({ perMinute: 12 }, async ({ req, user }) => {
  const { message } = body.parse(await readJson(req));
  return assistantReply(user, message);
});
