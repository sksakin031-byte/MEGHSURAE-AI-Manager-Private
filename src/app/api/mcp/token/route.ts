import { NextResponse, type NextRequest } from "next/server";
import { appOrigin, env } from "@/lib/env";
import { safeEqual } from "@/lib/crypto";
import { databaseRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/api";
import { issueMcpCredential, purgeExpiredMcpCredentials, revokeMcpCredentials, validClientId } from "@/mcp/credentials";

export const dynamic = "force-dynamic";

function masterAuthorized(req: NextRequest): boolean {
  const configured = env().MCP_AUTH_TOKEN;
  const header = req.headers.get("authorization");
  const bearer = header?.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  return Boolean(configured && bearer && safeEqual(bearer, configured));
}

function originAllowed(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  // Non-browser MCP clients normally omit Origin; browsers must be same-origin.
  return !origin || origin === appOrigin();
}

async function guard(req: NextRequest): Promise<NextResponse | null> {
  const e = env();
  if (!e.MCP_AUTH_TOKEN) return NextResponse.json({ error: { code: "disabled", message: "MCP is disabled." } }, { status: 503 });
  if (!originAllowed(req)) return NextResponse.json({ error: { code: "forbidden", message: "Cross-origin request blocked." } }, { status: 403 });
  if (!(await databaseRateLimit(`mcp-credential:${clientIp(req)}`, 20, 60_000)).ok) {
    return NextResponse.json({ error: { code: "rate_limited", message: "Too many credential requests." } }, { status: 429 });
  }
  if (!masterAuthorized(req)) {
    return NextResponse.json({ error: { code: "unauthorized", message: "Unauthorized." } }, { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="meghsurae-mcp"' } });
  }
  return null;
}

export async function POST(req: NextRequest) {
  const denied = await guard(req);
  if (denied) return denied;
  const clientId = req.headers.get("x-mcp-client-id");
  if (!validClientId(clientId)) return NextResponse.json({ error: { code: "invalid_client", message: "x-mcp-client-id must be 3-100 safe characters." } }, { status: 400 });
  const result = await issueMcpCredential(clientId);
  await purgeExpiredMcpCredentials();
  return NextResponse.json({ clientId, token: result.token, expiresAt: result.expiresAt.toISOString(), warning: "Store this token securely; it is shown only once and expires in one hour." }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(req: NextRequest) {
  const denied = await guard(req);
  if (denied) return denied;
  const clientId = req.headers.get("x-mcp-client-id");
  if (!validClientId(clientId)) return NextResponse.json({ error: { code: "invalid_client", message: "x-mcp-client-id must be 3-100 safe characters." } }, { status: 400 });
  const revoked = await revokeMcpCredentials(clientId);
  return NextResponse.json({ clientId, revoked }, { headers: { "Cache-Control": "no-store" } });
}

export function GET() {
  return NextResponse.json({ error: { code: "method_not_allowed", message: "Use POST to issue or DELETE to revoke credentials." } }, { status: 405, headers: { Allow: "POST, DELETE" } });
}
