"use client";
import { useState } from "react";
import { Check, Send } from "lucide-react";
import Link from "next/link";
import { sendJson } from "@/lib/client";
import { useMe } from "@/hooks/useApi";
import { ErrorNote, InfoNote } from "@/components/ui";

/**
 * Turns a prepared change into a proposal (Approval/Write mode) or applies it directly (Write mode, after a browser confirm).
 * The server re-checks permissions on every call; the disabled states here are only for guidance.
 */
export function ProposeButtons({ change, disabled }: { change: Record<string, unknown> | null; disabled?: boolean }) {
  const { data: me } = useMe();
  const mode = me?.user.permissionMode;
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(kind: "propose" | "apply") {
    if (!change) return;
    if (kind === "apply" && !window.confirm("Apply this change to your YouTube channel right now? This edits live data.")) return;
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      await sendJson("/api/changes", { change, mode: kind, confirm: kind === "apply" ? true : undefined });
      setMsg(kind === "apply" ? "Applied to YouTube and logged." : "Change prepared. Review the before/after values on the Changes page, then approve it.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  if (mode === "READ") {
    return <InfoNote>Read mode is active, so changes cannot be prepared. Switch to Approval mode in <Link className="underline" href="/settings">Settings</Link> to propose edits.</InfoNote>;
  }
  const off = busy || disabled || !change || !mode;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary" disabled={off} onClick={() => run("propose")}>
          <Send className="h-4 w-4" /> Prepare change for approval
        </button>
        {mode === "WRITE" && (
          <button type="button" className="btn btn-danger" disabled={off} onClick={() => run("apply")}>
            <Check className="h-4 w-4" /> Apply now…
          </button>
        )}
      </div>
      {msg && (
        <p className="text-sm text-ok">
          {msg} <Link href="/changes" className="underline">Open Changes</Link>
        </p>
      )}
      <ErrorNote error={error} />
    </div>
  );
}
