"use client";

export class ApiClientError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function parse<T>(res: Response): Promise<T> {
  const json = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined") window.location.href = "/login";
    throw new ApiClientError(res.status, json?.error?.code ?? "error", json?.error?.message ?? `Request failed (${res.status})`);
  }
  return json as T;
}

export async function getJson<T>(url: string): Promise<T> {
  return parse<T>(await fetch(url, { credentials: "same-origin", cache: "no-store" }));
}

export async function sendJson<T>(url: string, body: unknown, method: "POST" | "PATCH" | "DELETE" = "POST"): Promise<T> {
  return parse<T>(
    await fetch(url, {
      method,
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    }),
  );
}
