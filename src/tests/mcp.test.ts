import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { handleRpc, SUPPORTED_PROTOCOL_VERSIONS, type McpTool } from "@/mcp/protocol";

const tools: McpTool<{ n: number }>[] = [
  {
    name: "echo",
    description: "Echo text",
    inputSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
    schema: z.object({ text: z.string().max(10) }),
    readOnly: true,
    handler: async (ctx, a) => ({ echoed: a.text, n: ctx.n }),
  },
  {
    name: "boom",
    description: "Always fails",
    inputSchema: { type: "object", properties: {} },
    schema: z.object({}),
    readOnly: true,
    handler: async () => {
      throw new Error("db password is hunter2");
    },
  },
];
const call = (msg: unknown) => handleRpc(msg, { n: 1 }, tools, () => "The tool failed.", "hello");

describe("MCP protocol core", () => {
  it("negotiates protocol version and advertises tools capability", async () => {
    const r = await call({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } });
    expect((r?.result as { protocolVersion: string }).protocolVersion).toBe("2025-03-26");
    const r2 = await call({ jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "1999-01-01" } });
    expect((r2?.result as { protocolVersion: string }).protocolVersion).toBe(SUPPORTED_PROTOCOL_VERSIONS[0]);
    expect((r?.result as { capabilities: object }).capabilities).toHaveProperty("tools");
  });
  it("returns null for notifications", async () => {
    expect(await call({ jsonrpc: "2.0", method: "notifications/initialized" })).toBeNull();
  });
  it("lists tools with schemas", async () => {
    const r = await call({ jsonrpc: "2.0", id: 3, method: "tools/list" });
    const list = (r?.result as { tools: { name: string; inputSchema: object }[] }).tools;
    expect(list.map((t) => t.name)).toEqual(["echo", "boom"]);
    expect(list[0].inputSchema).toBeTruthy();
  });
  it("calls a tool and validates arguments", async () => {
    const ok = await call({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "echo", arguments: { text: "hi" } } });
    expect(JSON.stringify(ok?.result)).toContain("echoed");
    const bad = await call({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "echo", arguments: { text: "x".repeat(50) } } });
    expect((bad?.result as { isError: boolean }).isError).toBe(true);
  });
  it("never leaks internal error text", async () => {
    const r = await call({ jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "boom", arguments: {} } });
    expect(JSON.stringify(r)).not.toContain("hunter2");
    expect((r?.result as { isError: boolean }).isError).toBe(true);
  });
  it("rejects unknown tools, unknown methods and malformed requests", async () => {
    expect((await call({ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "nope" } }))?.error).toBeTruthy();
    expect((await call({ jsonrpc: "2.0", id: 8, method: "resources/list" }))?.error?.code).toBe(-32601);
    expect((await call({ nonsense: true }))?.error?.code).toBe(-32600);
  });
});

describe("real tool registry (source check)", () => {
  // Reading the source keeps this test independent of Prisma/Next runtime modules.
  const src = readFileSync(fileURLToPath(new URL("../mcp/tools.ts", import.meta.url)), "utf8");
  it("declares every required tool", () => {
    for (const n of ["get_channel_info", "list_videos", "analyze_video", "suggest_seo", "analyze_thumbnail", "list_playlists", "get_analytics_report", "audit_channel", "propose_metadata_update", "propose_playlist_change", "list_changes", "apply_change"])
      expect(src).toContain(`name: "${n}"`);
  });
  it("marks apply_change as write-capable and never offers an approve or delete tool", () => {
    const block = src.slice(src.indexOf('name: "apply_change"'));
    expect(block).toContain("readOnly: false");
    expect(src).not.toMatch(/name: "(approve|delete)/);
  });
});
