import type { NextRequest } from "next/server";
import { handleMcpHttp, methodNotAllowed } from "@/mcp/http";

export const dynamic = "force-dynamic";

// Optional: secret-in-URL variant for MCP clients that cannot send an Authorization header.
// Only works when MCP_ALLOW_URL_TOKEN="true". URLs can leak via logs/history; prefer the Bearer header.
export const POST = async (req: NextRequest, ctx: { params: Promise<{ token: string }> }) => handleMcpHttp(req, (await ctx.params).token);
export const GET = () => methodNotAllowed();
export const DELETE = () => methodNotAllowed();
