import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { db } from "@/lib/db";
import { env, appOrigin } from "@/lib/env";
import { safeEqual, sha256Hex } from "@/lib/crypto";
import { AppError } from "@/lib/errors";
import { databaseRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/api";
import { authenticateMcpCredential } from "@/mcp/credentials";
import { toSessionUser } from "@/lib/session";
import { handleRpc, RPC, type JsonRpcResponse } from "@/mcp/protocol";
import { INSTRUCTIONS, tools } from "@/mcp/tools";
import { logActivity } from "@/services/activity";

const ALLOWED_EXTRA_ORIGINS = ["https://claude.ai", "https://claude.com"];

/** Safe, secret-free error text for the model. */
function describeError(e: unknown): string {
  if (e instanceof AppError) return e.message;
  if (e instanceof ZodError) return `Invalid input: ${e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`;
  console.error("[mcp] tool error:", e instanceof Error ? e.message : "unknown");
  return "The tool failed due to a server error.";
}

function rpcError(status: number, code: number, message: string): NextResponse {
  const body: JsonRpcResponse = { jsonrpc: "2.0", id: null, error: { code, message } };
  return NextResponse.json(body, { status });
}

async function authorized(req: NextRequest, urlToken: string | undefined): Promise<boolean> {
  const e = env();
  if (!e.MCP_AUTH_TOKEN) return false;
  const header = req.headers.get("authorization");
  const bearer = header?.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : null;
  if (bearer && safeEqual(bearer, e.MCP_AUTH_TOKEN)) return true;
  if (bearer && await authenticateMcpCredential(bearer)) return true;
  if (urlToken && e.MCP_ALLOW_URL_TOKEN === "true" && safeEqual(urlToken, e.MCP_AUTH_TOKEN)) {
    try {
      await db.mcpTokenUse.create({ data: { tokenHash: sha256Hex(urlToken), expiresAt: new Date(Date.now() + 10 * 60_000) } });
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

export async function handleMcpHttp(req: NextRequest, urlToken?: string): Promise<NextResponse> {
  try {
    const e = env();
    if (!e.MCP_AUTH_TOKEN) return rpcError(503, RPC.internal, "MCP endpoint is disabled. Set MCP_AUTH_TOKEN to enable it.");

    const ip = clientIp(req);
    if (!(await databaseRateLimit(`mcp:${ip}`, 120, 60_000)).ok) return rpcError(429, RPC.internal, "Rate limit exceeded.");

    // DNS-rebinding defense from the MCP transport spec: reject unexpected browser origins.
    const origin = req.headers.get("origin");
    if (origin && origin !== appOrigin() && !ALLOWED_EXTRA_ORIGINS.includes(origin)) return rpcError(403, RPC.invalidRequest, "Origin not allowed.");

    if (!(await authorized(req, urlToken))) {
      // Throttle guessing attempts separately.
      if (!(await databaseRateLimit(`mcp-auth-fail:${ip}`, 10, 60_000)).ok) return rpcError(429, RPC.internal, "Too many failed attempts.");
      return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: RPC.invalidRequest, message: "Unauthorized." } }, { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="meghsurae-mcp"' } });
    }

    const maxBytes = 100_000;
    if (Number(req.headers.get("content-length") ?? "0") > maxBytes) return rpcError(413, RPC.invalidRequest, "Request too large.");
    if (!req.body) return rpcError(400, RPC.parse, "Parse error.");
    const reader = req.body.getReader();
    const decoder = new TextDecoder();
    let text = "";
    let bytes = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > maxBytes) return rpcError(413, RPC.invalidRequest, "Request too large.");
        text += decoder.decode(part.value, { stream: true });
      }
      text += decoder.decode();
    } finally {
      reader.releaseLock();
    }
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      return rpcError(400, RPC.parse, "Parse error.");
    }

    // The MCP token acts as the single channel owner.
    const owner = await db.user.findFirst({ where: e.ALLOWED_EMAIL ? { email: e.ALLOWED_EMAIL } : {}, orderBy: { createdAt: "asc" } });
    if (!owner || !owner.accessTokenEnc) return rpcError(409, RPC.internal, "No Google account is connected yet. Sign in to the web app first.");
    const ctx = { user: toSessionUser(owner) };

    const messages = Array.isArray(payload) ? payload : [payload];
    if (messages.length === 0 || messages.length > 20) return rpcError(400, RPC.invalidRequest, "Batch must contain 1-20 messages.");

    const responses: JsonRpcResponse[] = [];
    for (const m of messages) {
      const r = await handleRpc(m, ctx, tools, describeError, INSTRUCTIONS);
      if (r) responses.push(r);
      const method = (m as { method?: string; params?: { name?: string } } | null)?.method;
      if (method === "tools/call") await logActivity(owner.id, "mcp.tool_call", String((m as { params?: { name?: string } }).params?.name ?? "?"), "mcp", !(r && "result" in r && (r.result as { isError?: boolean }).isError));
    }
    if (responses.length === 0) return new NextResponse(null, { status: 202 });
    return NextResponse.json(Array.isArray(payload) ? responses : responses[0], { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[mcp] request failed:", err instanceof Error ? err.message : "unknown");
    return rpcError(500, RPC.internal, "Internal error.");
  }
}

export const methodNotAllowed = () =>
  new NextResponse(JSON.stringify({ error: "This MCP endpoint is stateless and accepts POST only." }), { status: 405, headers: { Allow: "POST", "Content-Type": "application/json" } });
