import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { decrypt, encrypt } from "@/lib/crypto";
import { refreshAccessToken } from "@/lib/google";
import { AppError } from "@/lib/errors";

/** Returns a valid Google access token for the user, refreshing (and persisting) it when needed. */
export async function getAccessToken(userId: string): Promise<string> {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || !user.accessTokenEnc) throw new AppError(401, "not_connected", "Google account is not connected. Sign in again.");
  const secret = env().TOKEN_ENCRYPTION_KEY;
  const stillValid = user.tokenExpiresAt && user.tokenExpiresAt.getTime() - Date.now() > 60_000;
  if (stillValid) return decrypt(user.accessTokenEnc, secret);

  if (!user.refreshTokenEnc) throw new AppError(401, "reauth_required", "Google session expired. Please sign in again.");
  try {
    const t = await refreshAccessToken(decrypt(user.refreshTokenEnc, secret));
    await db.user.update({
      where: { id: userId },
      data: {
        accessTokenEnc: encrypt(t.access_token, secret),
        tokenExpiresAt: new Date(Date.now() + t.expires_in * 1000),
        ...(t.refresh_token ? { refreshTokenEnc: encrypt(t.refresh_token, secret) } : {}),
        ...(t.scope ? { grantedScopes: t.scope } : {}),
      },
    });
    return t.access_token;
  } catch {
    // Typical cause: OAuth app in "Testing" status (refresh tokens expire after 7 days) or access revoked.
    throw new AppError(401, "reauth_required", "Google access expired or was revoked. Please sign in again.");
  }
}
