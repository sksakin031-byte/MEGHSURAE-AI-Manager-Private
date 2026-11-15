import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { destroyCurrentSession, sessionCookieName } from "@/lib/session";

export const POST = route({ perMinute: 30 }, async () => {
  await destroyCurrentSession();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(sessionCookieName(), "", { path: "/", maxAge: 0 });
  return res;
});
