import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { decrypt } from "@/lib/crypto";
import { revokeToken } from "@/lib/google";
import { sessionCookieName } from "@/lib/session";
import { logActivity } from "@/services/activity";
import { invalidateUserCache } from "@/services/insights";

/** Revokes the Google grant, wipes stored tokens, ends all sessions. */
export const POST = route({ perMinute: 5 }, async ({ user }) => {
  const row = await db.user.findUnique({ where: { id: user.id } });
  const secret = env().TOKEN_ENCRYPTION_KEY;
  for (const enc of [row?.refreshTokenEnc, row?.accessTokenEnc]) {
    if (!enc) continue;
    try {
      await revokeToken(decrypt(enc, secret));
      break;
    } catch {
      /* undecryptable token: just wipe it */
    }
  }
  await db.user.update({ where: { id: user.id }, data: { accessTokenEnc: null, refreshTokenEnc: null, tokenExpiresAt: null, grantedScopes: "", permissionMode: "READ" } });
  await db.session.deleteMany({ where: { userId: user.id } });
  invalidateUserCache(user.id);
  await logActivity(user.id, "auth.disconnect", "Google access revoked and tokens deleted", "system");
  const res = NextResponse.json({ ok: true });
  res.cookies.set(sessionCookieName(), "", { path: "/", maxAge: 0 });
  return res;
});
