// Pure permission logic. The single source of truth for "may this write happen?".
export const MODES = ["READ", "APPROVAL", "WRITE"] as const;
export type PermissionMode = (typeof MODES)[number];

export type Actor = "user" | "mcp";

export function isMode(v: unknown): v is PermissionMode {
  return typeof v === "string" && (MODES as readonly string[]).includes(v);
}

export const MODE_INFO: Record<PermissionMode, { label: string; summary: string }> = {
  READ: {
    label: "Read",
    summary: "Inspect and analyze only. Nothing can be proposed or changed.",
  },
  APPROVAL: {
    label: "Approval",
    summary:
      "Changes are prepared with before/after values. Nothing runs until you press Approve in this app.",
  },
  WRITE: {
    label: "Write",
    summary:
      "Supported changes can be applied directly, but only with explicit confirmation on every action. All actions are logged.",
  },
};

export interface Decision {
  allowed: boolean;
  reason?: string;
}

/** May a change proposal be created? */
export function canPropose(mode: PermissionMode): Decision {
  if (mode === "READ") {
    return { allowed: false, reason: "Read mode: switch to Approval or Write mode in Settings to prepare changes." };
  }
  return { allowed: true };
}

/**
 * May a change be executed against YouTube right now?
 *  - viaApproval: the signed-in user pressed "Approve" on an existing proposal in the UI.
 *  - otherwise: a direct apply (UI "apply now" or MCP apply_change); only allowed in WRITE mode.
 * `confirmed` must always be an explicit true.
 */
export function canExecute(input: {
  mode: PermissionMode;
  actor: Actor;
  confirmed: boolean;
  viaApproval: boolean;
}): Decision {
  const { mode, actor, confirmed, viaApproval } = input;
  if (mode === "READ") return { allowed: false, reason: "Read mode does not allow changes." };
  if (confirmed !== true) return { allowed: false, reason: "Explicit confirmation is required." };
  if (viaApproval) {
    if (actor !== "user") return { allowed: false, reason: "Only the signed-in user can approve a proposal." };
    return { allowed: true };
  }
  if (mode !== "WRITE") {
    return { allowed: false, reason: "Direct apply needs Write mode. In Approval mode, approve the proposal in the app." };
  }
  return { allowed: true };
}
