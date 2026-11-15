import { NextResponse, type NextRequest } from "next/server";

// Cheap gate only: the real session check (database lookup) happens in server components and route handlers.
// Middleware runs on the edge runtime and cannot use Prisma.
const SESSION_COOKIES = ["mg_session", "__Host-mg_session"];

function isPublic(path: string): boolean {
  return (
    path === "/login" ||
    path.startsWith("/api/auth/") ||
    path === "/api/health" ||
    path === "/api/mcp" ||
    path.startsWith("/api/mcp/") ||
    path === "/manifest.webmanifest" ||
    path === "/icon.svg" ||
    path.startsWith("/icons/")
  );
}

export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  if (isPublic(path)) return NextResponse.next();
  const has = SESSION_COOKIES.some((n) => req.cookies.get(n)?.value);
  if (has) return NextResponse.next();
  if (path.startsWith("/api/")) {
    return NextResponse.json({ error: { code: "unauthorized", message: "Sign in required." } }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
