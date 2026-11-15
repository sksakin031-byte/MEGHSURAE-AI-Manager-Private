"use client";
import { useState } from "react";
import { LogOut, ShieldOff } from "lucide-react";
import { Badge, Card, ErrorNote, InfoNote, PageHeader, Spinner } from "@/components/ui";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useApi } from "@/hooks/useApi";
import { sendJson } from "@/lib/client";

type Mode = "READ" | "APPROVAL" | "WRITE";
interface Settings {
  user: { email: string; channelTitle: string | null; channelId: string | null; permissionMode: Mode; canEditYouTube: boolean };
  modeInfo: Record<Mode, { label: string; summary: string }>;
  ai: { configured: boolean; provider: string | null; model: string | null; freeTier: boolean };
  mcp: { enabled: boolean; endpoint: string; urlTokenEnabled: boolean };
  singleOwnerLock: boolean;
  appUrl: string;
}

export default function SettingsPage() {
  const { data, error, loading, reload } = useApi<Settings>("/api/settings");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function setMode(m: Mode) {
    if (m === "WRITE" && !window.confirm("Write mode lets this app apply edits to your channel when you confirm each action. Enable it?")) return;
    setBusy(true);
    setErr(null);
    try {
      await sendJson("/api/settings", { permissionMode: m, confirm: m === "WRITE" ? true : undefined }, "PATCH");
      reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    await sendJson("/api/auth/logout", {});
    window.location.href = "/login";
  }
  async function disconnect() {
    if (!window.confirm("Revoke Google access and delete stored tokens? You will need to sign in again.")) return;
    try {
      await sendJson("/api/auth/disconnect", {});
      window.location.href = "/login";
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    }
  }

  const d = data;
  return (
    <>
      <PageHeader title="Settings & integrations" />
      <ErrorNote error={error ?? err} />
      {loading && <Spinner />}
      {d && (
        <div className="space-y-4">
          <Card className="space-y-3">
            <h2 className="font-semibold">Permission mode</h2>
            {(Object.keys(d.modeInfo) as Mode[]).map((m) => (
              <button key={m} disabled={busy} onClick={() => setMode(m)} aria-pressed={d.user.permissionMode === m} className={`w-full rounded-xl border p-3 text-left ${d.user.permissionMode === m ? "border-brand bg-brand/10" : "border-line"}`}>
                <div className="flex items-center gap-2 font-medium">{d.modeInfo[m].label}{d.user.permissionMode === m && <Badge tone="brand">Active</Badge>}</div>
                <p className="mt-1 text-sm text-muted">{d.modeInfo[m].summary}</p>
              </button>
            ))}
            {!d.user.canEditYouTube && (
              <InfoNote>
                Your Google connection is read-only, so Approval and Write modes are locked.{" "}
                <a className="underline" href="/api/auth/google?access=manage">Enable editing</a> to grant the YouTube edit permission.
              </InfoNote>
            )}
          </Card>

          <Card className="space-y-2 text-sm">
            <h2 className="font-semibold">Connected account</h2>
            <p>{d.user.email}</p>
            <p className="text-muted">Channel: {d.user.channelTitle ?? "Not loaded yet"}</p>
            <p className="text-muted">Access: {d.user.canEditYouTube ? "read and edit" : "read-only"} · {d.singleOwnerLock ? "locked to ALLOWED_EMAIL" : "first account to sign in owns this instance"}</p>
            <div className="flex flex-wrap gap-2 pt-1">
              <button className="btn" onClick={logout}><LogOut className="h-4 w-4" /> Sign out</button>
              <button className="btn btn-danger" onClick={disconnect}><ShieldOff className="h-4 w-4" /> Revoke Google access</button>
            </div>
          </Card>

          <Card className="space-y-2 text-sm">
            <h2 className="font-semibold">AI provider</h2>
            {d.ai.configured ? <p>{d.ai.provider} · {d.ai.model} · {d.ai.freeTier ? "free tier (rate limited)" : "paid API (billed by the provider)"}</p> : <p className="text-muted">None configured. Everything works with built-in rule-based analysis. Add GEMINI_API_KEY (free tier) to .env for AI rewrites, strategy narratives and the assistant.</p>}
          </Card>

          <Card className="space-y-2 text-sm">
            <h2 className="font-semibold">MCP server</h2>
            {d.mcp.enabled ? (
              <>
                <p>Enabled. Endpoint (needs a public HTTPS URL to be reachable by remote clients):</p>
                <code className="block break-all rounded-lg bg-bg p-2 text-xs">{d.mcp.endpoint}</code>
                <p className="text-muted">Use <code>POST /api/mcp/token</code> with the bootstrap secret to issue a one-hour, revocable credential for each client. MCP clients can prepare changes but cannot approve them.</p>
              </>
            ) : <p className="text-muted">Disabled. Set MCP_AUTH_TOKEN in .env (npm run gen:secrets) to enable it.</p>}
          </Card>

          <Card className="flex items-center justify-between"><span className="font-semibold">Theme</span><ThemeToggle /></Card>
        </div>
      )}
    </>
  );
}
