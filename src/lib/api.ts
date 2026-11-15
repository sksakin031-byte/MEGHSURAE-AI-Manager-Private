import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { AppError, forbidden, tooMany, unauthorized } from "@/lib/errors";
import { appOrigin } from "@/lib/env";
import { getSessionUser } from "@/lib/session";
import { databaseRateLimit } from "@/lib/rate-limit";
import type { SessionUser } from "@/types";

type Params = Record<string, string>;

export interface RouteArgs<U extends SessionUser | null> {
  req: NextRequest;
  user: U;
  params: Params;
}

interface Options {
  /** Requests per minute per user/IP (default 120). */
  perMinute?: number;
}

export function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

export function errorResponse(e: unknown): NextResponse {
  if (e instanceof AppError) {
    return NextResponse.json({ error: { code: e.code, message: e.message, details: e.details } }, { status: e.status });
  }
  if (e instanceof ZodError) {
    return NextResponse.json(
      { error: { code: "invalid_input", message: "Invalid input.", details: e.issues.map((i) => ({ path: i.path.join("."), message: i.message })) } },
      { status: 400 },
    );
  }
  // Log server-side without leaking internals (no tokens are ever put into errors).
  console.error("[api] unhandled error:", e instanceof Error ? e.message : "unknown");
  return NextResponse.json({ error: { code: "internal", message: "Something went wrong on the server." } }, { status: 500 });
}

type RouteFn = (req: NextRequest, ctx: { params: Promise<Params> }) => Promise<NextResponse>;

function build<U extends SessionUser | null>(
  requireAuth: boolean,
  options: Options,
  handler: (args: RouteArgs<U>) => Promise<unknown>,
): RouteFn {
  return async (req, ctx) => {
    try {
      const mutating = !["GET", "HEAD", "OPTIONS"].includes(req.method);
      if (mutating) {
        // CSRF defense: browsers always send Origin on cross-site POST/PATCH/DELETE.
        const origin = req.headers.get("origin");
        if (!origin || origin !== appOrigin()) throw forbidden("Cross-origin request blocked.");
      }
      let user: SessionUser | null = null;
      if (requireAuth) {
        user = await getSessionUser();
        if (!user) throw unauthorized();
      }
      const key = `${user?.id ?? clientIp(req)}:${req.nextUrl.pathname}`;
      const rl = await databaseRateLimit(key, options.perMinute ?? 120, 60_000);
      if (!rl.ok) throw tooMany(`Too many requests. Retry in ${rl.retryAfterSec}s.`);

      const params = await ctx.params;
      const result = await handler({ req, user: user as U, params: params ?? {} });
      if (result instanceof NextResponse) return result;
      return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
    } catch (e) {
      return errorResponse(e);
    }
  };
}

/** Authenticated JSON route: session + same-origin check (mutations) + rate limit + uniform errors. */
export function route(options: Options, handler: (args: RouteArgs<SessionUser>) => Promise<unknown>): RouteFn {
  return build<SessionUser>(true, options, handler);
}

/** Public route (no session). Still rate limited and same-origin checked for mutations. */
export function publicRoute(options: Options, handler: (args: RouteArgs<null>) => Promise<unknown>): RouteFn {
  return build<null>(false, options, handler);
}

export async function readJson(req: NextRequest): Promise<unknown> {
  const maxBytes = 200_000;
  const advertised = Number(req.headers.get("content-length") ?? "0");
  if (advertised > maxBytes) throw new AppError(413, "too_large", "Request body too large.");
  if (!req.body) return {};
  const reader = req.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > maxBytes) throw new AppError(413, "too_large", "Request body too large.");
      text += decoder.decode(part.value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    reader.releaseLock();
  }
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new AppError(400, "bad_json", "Request body must be valid JSON.");
  }
}
