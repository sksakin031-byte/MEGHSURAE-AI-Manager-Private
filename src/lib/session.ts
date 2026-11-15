import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { env, isHttps } from "@/lib/env";
import { randomToken, sha256Hex } from "@/lib/crypto";
import { isMode, type PermissionMode } from "@/lib/permissions";
import type { SessionUser } from "@/types";

const SESSION_DAYS = 14;
export const YT_WRITE_SCOPE = "https://www.googleapis.com/auth/youtube.force-ssl";

export function sessionCookieName(): string {
  // The __Host- prefix requires Secure + Path=/, so only use it over HTTPS.
  return isHttps() ? "__Host-mg_session" : "mg_session";
}

export function cookieOptions(maxAgeSec: number) {
  return {
    httpOnly: true,
    secure: isHttps(),
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSec,
  };
}

export async function createSession(userId: string): Promise<{ token: string; maxAgeSec: number }> {
  const token = randomToken(32);
  const maxAgeSec = SESSION_DAYS * 86_400;
  await db.session.create({
    data: { tokenHash: sha256Hex(token), userId, expiresAt: new Date(Date.now() + maxAgeSec * 1000) },
  });
  // Opportunistic cleanup of expired sessions / oauth states.
  await db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch(() => undefined);
  await db.oAuthState.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch(() => undefined);
  return { token, maxAgeSec };
}

export function toSessionUser(u: {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
  channelId: string | null;
  channelTitle: string | null;
  permissionMode: string;
  grantedScopes: string;
}): SessionUser {
  const scopes = u.grantedScopes.split(" ").filter(Boolean);
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    picture: u.picture,
    channelId: u.channelId,
    channelTitle: u.channelTitle,
    permissionMode: (isMode(u.permissionMode) ? u.permissionMode : "READ") as PermissionMode,
    grantedScopes: scopes,
    canEditYouTube: scopes.includes(YT_WRITE_SCOPE),
  };
}

/** Reads the session cookie (server components and route handlers). Returns null if not signed in. */
export async function getSessionUser(): Promise<SessionUser | null> {
  env(); // fail fast on bad configuration
  const jar = await cookies();
  const token = jar.get(sessionCookieName())?.value;
  if (!token || token.length < 20 || token.length > 200) return null;
  const session = await db.session.findUnique({ where: { tokenHash: sha256Hex(token) }, include: { user: true } });
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await db.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  return toSessionUser(session.user);
}

export async function destroyCurrentSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(sessionCookieName())?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: sha256Hex(token) } });
}
