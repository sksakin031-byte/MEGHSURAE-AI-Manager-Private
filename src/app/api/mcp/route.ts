import type { NextRequest } from "next/server";
import { handleMcpHttp, methodNotAllowed } from "@/mcp/http";

export const dynamic = "force-dynamic";

export const POST = (req: NextRequest) => handleMcpHttp(req);
export const GET = () => methodNotAllowed();
export const DELETE = () => methodNotAllowed();
