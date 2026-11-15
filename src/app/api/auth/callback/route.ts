import { NextResponse } from "next/server";
import { publicRoute } from "@/lib/api";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { encrypt, safeEqual } from "@/lib/crypto";
import { exchangeCode, fetchUserInfo } from "@/lib/google";
import { AppError } from "@/lib/errors";
import { cookieOptions, createSession, sessionCookieName } from "@/lib/session";
import { getMyChannel } from "@/services/youtube";
import { logActivity } from "@/services/activity";
import { invalidateUserCache } from "@/services/insights";

function fail(code: string): NextResponse {
  const res = NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(code)}`, env().APP_URL));
  res.cookies.set("mg_oauth", "", { path: "/api/auth", maxAge: 0 });
  return res;
}

export const GET = publicRoute({ perMinute: 20 }, async ({ req }) => {
  try {
    const sp = req.nextUrl.searchParams;
    if (sp.get("error")) return fail(sp.get("error") === "access_denied" ? "access_denied" : "google_error");
    const code = sp.get("code");
    const state = sp.get("state");
    const cookieState = req.cookies.get("mg_oauth")?.value;
    if (!code || !state || !cookieState || !safeEqual(state, cookieState)) return fail("invalid_state");

    // Atomically claim the state before using its verifier. Only one concurrent callback can win.
    const now = new Date();
    const claimed = await db.oAuthState.updateMany({
      where: { state, expiresAt: { gt: now }, consumedAt: null },
      data: { consumedAt: now },
    });
    if (claimed.count !== 1) return fail("expired_state");
    const rec = await db.oAuthState.findUnique({ where: { state } });
    if (!rec) return fail("expired_state");

    const tokens = await exchangeCode(code, rec.verifier);
    const profile = await fetchUserInfo(tokens.access_token);
    if (!profile.email_verified) return fail("email_unverified");

    const e = env();
    if (e.ALLOWED_EMAIL) {
      if (profile.email.toLowerCase() !== e.ALLOWED_EMAIL.toLowerCase()) return fail("not_allowed");
    } else {
      // Single-owner safeguard: without ALLOWED_EMAIL, only the first account to sign in is ever accepted.
      const existing = await db.user.findFirst();
      if (existing && existing.googleSub !== profile.sub) return fail("instance_taken");
    }

    const prev = await db.user.findUnique({ where: { googleSub: profile.sub } });
    const refresh = tokens.refresh_token ? encrypt(tokens.refresh_token, e.TOKEN_ENCRYPTION_KEY) : prev?.refreshTokenEnc ?? null;
    const data = {
      email: profile.email,
      name: profile.name ?? null,
      picture: profile.picture ?? null,
      accessTokenEnc: encrypt(tokens.access_token, e.TOKEN_ENCRYPTION_KEY),
      refreshTokenEnc: refresh,
      tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      grantedScopes: tokens.scope ?? prev?.grantedScopes ?? "",
    };
    const user = prev
      ? await db.user.update({ where: { id: prev.id }, data })
      : await db.user.create({ data: { ownerKey: "owner", googleSub: profile.sub, ...data } });

    // Best effort: remember the channel. A Google account without a channel still signs in.
    try {
      const ch = await getMyChannel(user.id);
      await db.user.update({ where: { id: user.id }, data: { channelId: ch.id, channelTitle: ch.title } });
    } catch {
      /* ignore */
    }
    invalidateUserCache(user.id);

    // Downgrade protection: if the new grant lacks the write scope, force READ mode.
    if (!data.grantedScopes.includes("youtube.force-ssl") && user.permissionMode !== "READ") {
      await db.user.update({ where: { id: user.id }, data: { permissionMode: "READ" } });
    }

    const { token, maxAgeSec } = await createSession(user.id);
    await logActivity(user.id, "auth.login", `Signed in as ${profile.email}`, "system");
    const res = NextResponse.redirect(new URL("/", e.APP_URL));
    res.cookies.set(sessionCookieName(), token, cookieOptions(maxAgeSec));
    res.cookies.set("mg_oauth", "", { path: "/api/auth", maxAge: 0 });
    return res;
  } catch (err) {
    if (err instanceof AppError && err.code === "misconfigured") throw err;
    // A concurrent first login may have won the unique singleton owner claim.
    if (typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "P2002") return fail("instance_taken");
    console.error("[auth] callback failed:", err instanceof Error ? err.message : "unknown");
    return fail("login_failed");
  }
});
