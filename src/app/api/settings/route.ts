import { z } from "zod";
import { route, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { forbidden } from "@/lib/errors";
import { MODES, MODE_INFO } from "@/lib/permissions";
import { aiStatus } from "@/services/ai";
import { logActivity } from "@/services/activity";

export const GET = route({}, async ({ user }) => {
  const e = env();
  return {
    user: { email: user.email, name: user.name, picture: user.picture, channelId: user.channelId, channelTitle: user.channelTitle, permissionMode: user.permissionMode, canEditYouTube: user.canEditYouTube },
    modeInfo: MODE_INFO,
    ai: aiStatus(),
    mcp: {
      enabled: Boolean(e.MCP_AUTH_TOKEN),
      endpoint: `${e.APP_URL}/api/mcp`,
      urlTokenEnabled: e.MCP_ALLOW_URL_TOKEN === "true",
    },
    singleOwnerLock: Boolean(e.ALLOWED_EMAIL),
    appUrl: e.APP_URL,
  };
});

const body = z.object({ permissionMode: z.enum(MODES), confirm: z.boolean().optional() });

export const PATCH = route({ perMinute: 20 }, async ({ req, user }) => {
  const input = body.parse(await readJson(req));
  if (input.permissionMode !== "READ" && !user.canEditYouTube) {
    throw forbidden("Your Google connection is read-only. Use 'Enable editing' below to grant edit access first.");
  }
  if (input.permissionMode === "WRITE" && input.confirm !== true) {
    throw forbidden("Switching to Write mode needs explicit confirmation.");
  }
  await db.user.update({ where: { id: user.id }, data: { permissionMode: input.permissionMode } });
  await logActivity(user.id, "settings.mode", `Permission mode changed ${user.permissionMode} → ${input.permissionMode}`, "ui");
  return { permissionMode: input.permissionMode };
});
