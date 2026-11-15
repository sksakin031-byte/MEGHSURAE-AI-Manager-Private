import { NextResponse } from "next/server";
import { publicRoute } from "@/lib/api";
import { db } from "@/lib/db";
import { env, isHttps } from "@/lib/env";
import { pkceChallenge, randomToken } from "@/lib/crypto";
import { buildAuthUrl, type AccessLevel } from "@/lib/google";

export const GET = publicRoute({ perMinute: 20 }, async ({ req }) => {
  const access: AccessLevel = req.nextUrl.searchParams.get("access") === "manage" ? "manage" : "read";
  const state = randomToken(24);
  const verifier = randomToken(48);
  await db.oAuthState.create({ data: { state, verifier, expiresAt: new Date(Date.now() + 10 * 60_000) } });

  const url = buildAuthUrl({ state, challenge: pkceChallenge(verifier), access, loginHint: env().ALLOWED_EMAIL });
  const res = NextResponse.redirect(url);
  // Binds the OAuth flow to THIS browser (defends against login CSRF).
  res.cookies.set("mg_oauth", state, { httpOnly: true, secure: isHttps(), sameSite: "lax", path: "/api/auth", maxAge: 600 });
  return res;
});
