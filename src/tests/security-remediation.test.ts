import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const read = (path: string) => readFileSync(`${root}/${path}`, "utf8");

describe("security remediation invariants", () => {
  it("uses database-backed rate limiting and bounded streaming bodies", () => {
    const api = read("src/lib/api.ts");
    const limiter = read("src/lib/rate-limit.ts");
    const mcp = read("src/mcp/http.ts");
    expect(api).toContain("databaseRateLimit");
    expect(api).toContain("getReader()");
    expect(limiter).toContain("rateLimitBucket");
    expect(mcp).toContain("getReader()");
    expect(mcp).toContain("mcpTokenUse");
  });

  it("enforces a unique owner claim and records uncertain writes", () => {
    const sqlite = read("prisma/schema.prisma");
    const postgres = read("prisma/schema.postgres.prisma");
    const callback = read("src/app/api/auth/callback/route.ts");
    const changes = read("src/services/changes.ts");
    expect(sqlite).toContain("ownerKey        String          @unique");
    expect(postgres).toContain("ownerKey        String          @unique");
    expect(callback).toContain('ownerKey: "owner"');
    expect(callback).toContain('"P2002"');
    expect(changes).toContain('"UNCERTAIN"');
    expect(changes).toContain("outcome is unknown");
  });

  it("does not expose approval or destructive MCP tools", () => {
    const tools = read("src/mcp/tools.ts");
    expect(tools).not.toMatch(/name:\s*["']approve_change/);
    expect(tools).not.toMatch(/name:\s*["']delete_/);
    expect(tools).toContain("confirm: z.boolean()");
  });
});
