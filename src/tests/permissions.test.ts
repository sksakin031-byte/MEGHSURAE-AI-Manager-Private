import { describe, expect, it } from "vitest";
import { canExecute, canPropose, isMode } from "@/lib/permissions";

describe("permission modes", () => {
  it("READ blocks proposals and execution", () => {
    expect(canPropose("READ").allowed).toBe(false);
    for (const viaApproval of [true, false])
      expect(canExecute({ mode: "READ", actor: "user", confirmed: true, viaApproval }).allowed).toBe(false);
  });

  it("APPROVAL allows proposals; execution only through user approval with confirmation", () => {
    expect(canPropose("APPROVAL").allowed).toBe(true);
    expect(canExecute({ mode: "APPROVAL", actor: "user", confirmed: true, viaApproval: true }).allowed).toBe(true);
    expect(canExecute({ mode: "APPROVAL", actor: "user", confirmed: false, viaApproval: true }).allowed).toBe(false);
    expect(canExecute({ mode: "APPROVAL", actor: "user", confirmed: true, viaApproval: false }).allowed).toBe(false);
  });

  it("MCP can never approve a proposal", () => {
    expect(canExecute({ mode: "APPROVAL", actor: "mcp", confirmed: true, viaApproval: true }).allowed).toBe(false);
    expect(canExecute({ mode: "WRITE", actor: "mcp", confirmed: true, viaApproval: true }).allowed).toBe(false);
  });

  it("WRITE allows direct apply only with explicit confirmation", () => {
    expect(canExecute({ mode: "WRITE", actor: "user", confirmed: true, viaApproval: false }).allowed).toBe(true);
    expect(canExecute({ mode: "WRITE", actor: "user", confirmed: false, viaApproval: false }).allowed).toBe(false);
  });

  it("isMode validates strings", () => {
    expect(isMode("READ")).toBe(true);
    expect(isMode("ADMIN")).toBe(false);
    expect(isMode(undefined)).toBe(false);
  });
});
