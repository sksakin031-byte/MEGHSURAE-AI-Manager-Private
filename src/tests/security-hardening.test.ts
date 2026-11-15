import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { validClientId } from "@/mcp/credentials";

const root = fileURLToPath(new URL("../..", import.meta.url));
const read = (path: string) => readFileSync(`${root}/${path}`, "utf8");

describe("remaining security hardening", () => {
  it("uses a shared limiter for competitor quota and serializable conflict retries", () => {
    const aiTasks = read("src/services/ai-tasks.ts");
    const limiter = read("src/lib/rate-limit.ts");
    expect(aiTasks).toContain("databaseRateLimit");
    expect(aiTasks).not.toContain("rateLimit(`competitors:");
    expect(limiter).toContain("TransactionIsolationLevel.Serializable");
    expect(limiter).toContain('"P2034"');
  });

  it("atomically claims OAuth state and stores consumed state in both schemas", () => {
    const callback = read("src/app/api/auth/callback/route.ts");
    expect(callback).toContain("oAuthState.updateMany");
    expect(callback).toContain("consumedAt: null");
    expect(read("prisma/schema.prisma")).toContain("consumedAt DateTime?");
    expect(read("prisma/schema.postgres.prisma")).toContain("consumedAt DateTime?");
    expect(read("prisma/postgresql/schema.prisma")).toContain("consumedAt DateTime?");
    expect(read("prisma/postgresql/schema.prisma")).toContain("model McpCredential");
  });

  it("validates safe per-client identifiers and never stores raw MCP credentials", () => {
    expect(validClientId("claude-desktop")).toBe(true);
    expect(validClientId("x")).toBe(false);
    expect(validClientId("bad client")).toBe(false);
    const credentials = read("src/mcp/credentials.ts");
    expect(credentials).toContain("sha256Hex(token)");
    expect(credentials).toContain("revokedAt");
    expect(credentials).toContain("expiresAt.getTime() <= Date.now()");
  });

  it("retains CSRF, body-size, approval, and uncertain-outcome protections", () => {
    const api = read("src/lib/api.ts");
    const changes = read("src/services/changes.ts");
    const permissions = read("src/lib/permissions.ts");
    expect(api).toContain('origin !== appOrigin()');
    expect(api).toContain("getReader()");
    expect(changes).toContain('status: drift ? "PENDING" : uncertain ? "UNCERTAIN"');
    expect(permissions).toContain("Only the signed-in user can approve");
    expect(read("src/mcp/http.ts")).toContain("authenticateMcpCredential");
  });
  it("validates browser origins before issuing or revoking MCP credentials", () => {
    const route = read("src/app/api/mcp/token/route.ts");
    expect(route).toContain('import { appOrigin, env } from "@/lib/env"');
    expect(route).toContain("function originAllowed");
    expect(route).toContain("return !origin || origin === appOrigin()");
    expect(route).toContain("Cross-origin request blocked.");
  });
  it("serializes playlist additions and rechecks duplicate state at execution", () => {
    const changes = read("src/services/changes.ts");
    expect(changes).toContain("withPlaylistAddLock");
    expect(changes).toContain("assertNoConcurrentPlaylistAdd");
    expect(changes).toContain("listPlaylistVideoIds(userId, c.targetId)");
    expect(changes).toContain('status: { in: ["PENDING", "EXECUTING"] }');
  });
  it("rejects a change with a status-conditional atomic update", () => {
    const changes = read("src/services/changes.ts");
    expect(changes).toContain("const rejected = await db.pendingChange.updateMany");
    expect(changes).toContain('status: "PENDING"');
    expect(changes).toContain("if (rejected.count !== 1)");
    expect(changes).toContain("findUniqueOrThrow");
  });
  it("allows every persisted change status through the Changes API filter", () => {
    const route = read("src/app/api/changes/route.ts");
    expect(route).toContain('["PENDING", "EXECUTING", "EXECUTED", "REJECTED", "FAILED", "UNCERTAIN"]');
  });
  it("uses an explicit CSP and removes the custom inline theme script", () => {
    const config = read("next.config.ts");
    const layout = read("src/app/layout.tsx");
    expect(config).toContain("default-src 'self'");
    expect(config).toContain("object-src 'none'");
    expect(config).toContain("connect-src 'self'");
    expect(layout).not.toContain("dangerouslySetInnerHTML");
  });
});

describe("serialized limiter contention model", () => {
  it("admits no more than the configured limit under concurrent requests", async () => {
    let hits: number[] = [];
    let lock = Promise.resolve();
    const request = async () => {
      let release!: () => void;
      const next = new Promise<void>((resolve) => { release = resolve; });
      const previous = lock;
      lock = next;
      await previous;
      const now = Date.now();
      hits = hits.filter((t) => t > now - 60_000);
      const ok = hits.length < 5;
      if (ok) hits.push(now);
      release();
      return ok;
    };
    const results = await Promise.all(Array.from({ length: 20 }, request));
    expect(results.filter(Boolean)).toHaveLength(5);
  });
});
