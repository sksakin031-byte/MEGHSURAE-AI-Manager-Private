"use client";
import { useState } from "react";
import { Badge, Card, ErrorNote, InfoNote, PageHeader, Spinner, statusTone } from "@/components/ui";
import { useApi, useMe } from "@/hooks/useApi";
import { sendJson } from "@/lib/client";
import { fmtDateTime } from "@/lib/format";
import type { ChangeRecord } from "@/types";

interface Activity { id: string; action: string; detail: string; source: string; ok: boolean; createdAt: string }

function show(v: unknown): string {
  if (v === undefined || v === null) return "—";
  if (Array.isArray(v)) return v.join(", ") || "(empty)";
  return typeof v === "string" ? v || "(empty)" : JSON.stringify(v);
}

function Diff({ c }: { c: ChangeRecord }) {
  const keys = Object.keys(c.after);
  return (
    <div className="space-y-2">
      {keys.map((k) => (
        <div key={k} className="rounded-xl border border-line text-xs">
          <div className="border-b border-line px-3 py-1 font-medium">{k}</div>
          <div className="grid gap-px sm:grid-cols-2">
            <div className="p-3"><div className="mb-1 text-muted">Before</div><div className="whitespace-pre-wrap break-words text-danger">{show(c.before?.[k])}</div></div>
            <div className="p-3"><div className="mb-1 text-muted">After</div><div className="whitespace-pre-wrap break-words text-ok">{show(c.after[k])}</div></div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ChangesPage() {
  const [tab, setTab] = useState<"pending" | "history" | "log">("pending");
  const changes = useApi<{ changes: ChangeRecord[] }>("/api/changes");
  const log = useApi<{ activity: Activity[] }>(tab === "log" ? "/api/activity" : null);
  const { data: me } = useMe();
  const mode = me?.user.permissionMode;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(id: string, action: "approve" | "reject" | "revert") {
    if (action === "approve" && !window.confirm("Approve and apply this change to your live YouTube channel?")) return;
    setBusy(id);
    setError(null);
    try {
      await sendJson(`/api/changes/${id}`, { action, confirm: action === "approve" ? true : undefined });
      changes.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
      changes.reload();
    } finally {
      setBusy(null);
    }
  }

  const all = changes.data?.changes ?? [];
  const pending = all.filter((c) => c.status === "PENDING");
  const history = all.filter((c) => c.status !== "PENDING");
  const list = tab === "pending" ? pending : history;

  return (
    <>
      <PageHeader title="Changes & activity log" subtitle="Every edit is shown as before/after and runs only after your approval." />
      <div className="mb-4 grid grid-cols-3 gap-2" role="tablist">
        {(["pending", "history", "log"] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={`btn ${tab === t ? "btn-primary" : ""}`} onClick={() => setTab(t)}>
            {t === "pending" ? `Pending (${pending.length})` : t === "history" ? "History" : "Activity"}
          </button>
        ))}
      </div>
      {mode === "READ" && <div className="mb-3"><InfoNote>Read mode: approvals are disabled. Switch mode in Settings.</InfoNote></div>}
      <ErrorNote error={error ?? changes.error} />
      {changes.loading && <Spinner />}

      {tab !== "log" && (
        <div className="space-y-3">
          {list.map((c) => (
            <Card key={c.id} className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={statusTone(c.status)}>{c.status}</Badge>
                <Badge>{c.kind}</Badge>
                <Badge>via {c.source}</Badge>
              </div>
              <p className="text-sm font-medium">{c.summary}</p>
              <Diff c={c} />
              <p className="text-xs text-muted">Created {fmtDateTime(c.createdAt)}{c.executedAt ? ` · applied ${fmtDateTime(c.executedAt)}` : ""}</p>
              {c.error && <ErrorNote error={c.error} />}
              {c.status === "PENDING" && (
                <div className="flex gap-2">
                  <button className="btn btn-primary flex-1" disabled={busy === c.id || mode === "READ"} onClick={() => act(c.id, "approve")}>Approve & apply</button>
                  <button className="btn flex-1" disabled={busy === c.id} onClick={() => act(c.id, "reject")}>Reject</button>
                </div>
              )}
              {c.status === "EXECUTED" && (c.kind === "video_metadata" || c.kind === "playlist_update") && (
                <button className="btn" disabled={busy === c.id || mode === "READ"} onClick={() => act(c.id, "revert")}>Prepare a revert</button>
              )}
            </Card>
          ))}
          {!changes.loading && list.length === 0 && <p className="text-sm text-muted">Nothing here yet.</p>}
        </div>
      )}

      {tab === "log" && (
        <Card className="divide-y divide-line !p-0">
          {log.loading && <Spinner />}
          <ErrorNote error={log.error} />
          {log.data?.activity.map((a) => (
            <div key={a.id} className="p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2"><Badge tone={a.ok ? "ok" : "danger"}>{a.action}</Badge><Badge>{a.source}</Badge><span className="text-xs text-muted">{fmtDateTime(a.createdAt)}</span></div>
              <p className="mt-1 break-words text-muted">{a.detail}</p>
            </div>
          ))}
          {log.data?.activity.length === 0 && <p className="p-4 text-sm text-muted">No activity yet.</p>}
        </Card>
      )}
    </>
  );
}
