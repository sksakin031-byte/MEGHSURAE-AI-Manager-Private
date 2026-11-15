// Minimal MCP (Model Context Protocol) server core: JSON-RPC 2.0 over stateless Streamable HTTP.
// Implemented by hand (no SDK dependency) and covered by unit tests. Supports: initialize, ping, tools/list, tools/call.
import type { ZodTypeAny } from "zod";

export const SUPPORTED_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"] as const;
export const SERVER_INFO = { name: "meghsurae-ai-manager", version: "1.0.0" };

export interface McpTool<Ctx> {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  schema: ZodTypeAny;
  readOnly: boolean;
  handler: (ctx: Ctx, args: any) => Promise<unknown>;
}

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export const RPC = { parse: -32700, invalidRequest: -32600, methodNotFound: -32601, invalidParams: -32602, internal: -32603 } as const;

const MAX_TEXT = 60_000;

const err = (id: JsonRpcResponse["id"], code: number, message: string): JsonRpcResponse => ({ jsonrpc: "2.0", id, error: { code, message } });

function isRequest(x: unknown): x is JsonRpcRequest {
  return typeof x === "object" && x !== null && (x as { jsonrpc?: unknown }).jsonrpc === "2.0" && typeof (x as { method?: unknown }).method === "string";
}

export function toolResult(value: unknown, isError = false) {
  let text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  if (text.length > MAX_TEXT) text = `${text.slice(0, MAX_TEXT)}\n…[truncated]`;
  return { content: [{ type: "text", text }], isError };
}

/**
 * Handles one JSON-RPC message. Returns null for notifications (HTTP layer should answer 202).
 * `describeError` converts thrown errors into safe messages for the model (must never include secrets).
 */
export async function handleRpc<Ctx>(
  msg: unknown,
  ctx: Ctx,
  tools: McpTool<Ctx>[],
  describeError: (e: unknown) => string,
  instructions?: string,
): Promise<JsonRpcResponse | null> {
  if (!isRequest(msg)) return err(null, RPC.invalidRequest, "Invalid JSON-RPC request.");
  const hasId = msg.id !== undefined && msg.id !== null;
  const id = hasId ? (msg.id as string | number) : null;

  if (!hasId) return null; // notifications (e.g. notifications/initialized) need no response

  switch (msg.method) {
    case "initialize": {
      const requested = typeof msg.params?.protocolVersion === "string" ? msg.params.protocolVersion : "";
      const version = (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(requested) ? requested : SUPPORTED_PROTOCOL_VERSIONS[0];
      return { jsonrpc: "2.0", id, result: { protocolVersion: version, capabilities: { tools: { listChanged: false } }, serverInfo: SERVER_INFO, ...(instructions ? { instructions } : {}) } };
    }
    case "ping":
      return { jsonrpc: "2.0", id, result: {} };
    case "tools/list":
      return {
        jsonrpc: "2.0",
        id,
        result: {
          tools: tools.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
            annotations: { readOnlyHint: t.readOnly, destructiveHint: false, openWorldHint: true },
          })),
        },
      };
    case "tools/call": {
      const name = msg.params?.name;
      const tool = typeof name === "string" ? tools.find((t) => t.name === name) : undefined;
      if (!tool) return err(id, RPC.invalidParams, `Unknown tool: ${String(name)}`);
      const parsed = tool.schema.safeParse(msg.params?.arguments ?? {});
      if (!parsed.success) {
        return { jsonrpc: "2.0", id, result: toolResult(`Invalid arguments: ${parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ")}`, true) };
      }
      try {
        return { jsonrpc: "2.0", id, result: toolResult(await tool.handler(ctx, parsed.data)) };
      } catch (e) {
        return { jsonrpc: "2.0", id, result: toolResult(describeError(e), true) };
      }
    }
    default:
      return err(id, RPC.methodNotFound, `Method not found: ${msg.method}`);
  }
}
