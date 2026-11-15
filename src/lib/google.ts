import { env } from "@/lib/env";
import { upstream } from "@/lib/errors";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";

export type AccessLevel = "read" | "manage";

const BASE_SCOPES = ["openid", "email", "profile", "https://www.googleapis.com/auth/yt-analytics.readonly"];
const SCOPES: Record<AccessLevel, string[]> = {
  // Least privilege by default: can read channel data, cannot edit it.
  read: [...BASE_SCOPES, "https://www.googleapis.com/auth/youtube.readonly"],
  // Needed to update videos/playlists. Still gated by the app's permission modes.
  manage: [...BASE_SCOPES, "https://www.googleapis.com/auth/youtube.force-ssl"],
};

export function redirectUri(): string {
  return `${env().APP_URL}/api/auth/callback`;
}

export function buildAuthUrl(args: { state: string; challenge: string; access: AccessLevel; loginHint?: string }): string {
  const p = new URLSearchParams({
    client_id: env().GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: SCOPES[args.access].join(" "),
    state: args.state,
    code_challenge: args.challenge,
    code_challenge_method: "S256",
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
  });
  if (args.loginHint) p.set("login_hint", args.loginHint);
  return `${AUTH_URL}?${p.toString()}`;
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  id_token?: string;
}

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env().GOOGLE_CLIENT_ID,
      client_secret: env().GOOGLE_CLIENT_SECRET,
      ...body,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    // Only the error code is surfaced; never the request body.
    throw upstream(`Google token endpoint error: ${String(json.error ?? res.status)}`, 502);
  }
  return json as unknown as TokenResponse;
}

export function exchangeCode(code: string, verifier: string): Promise<TokenResponse> {
  return tokenRequest({ grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: redirectUri() });
}

export function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  return tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
}

export interface GoogleProfile {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
  picture?: string;
}

export async function fetchUserInfo(accessToken: string): Promise<GoogleProfile> {
  const res = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw upstream("Could not read Google profile.");
  return (await res.json()) as GoogleProfile;
}

export async function revokeToken(token: string): Promise<void> {
  await fetch(REVOKE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => undefined);
}
