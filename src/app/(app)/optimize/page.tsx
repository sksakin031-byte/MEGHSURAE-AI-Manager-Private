"use client";
import { Badge, Card, ErrorNote, PageHeader, Spinner, statusTone } from "@/components/ui";
import { useApi } from "@/hooks/useApi";
import { fmtDateTime } from "@/lib/format";
import type { AuditResult } from "@/lib/channel-audit";

export default function OptimizePage() {
  const { data, error, loading } = useApi<{ audit: AuditResult }>("/api/channel/audit");
  const a = data?.audit;
  const order = { high: 0, medium: 1, low: 2 } as const;
  const items = [...(a?.items ?? [])].sort((x, y) => (x.status === y.status ? 0 : x.status === "todo" ? -1 : 1) || order[x.priority] - order[y.priority]);
  return (
    <>
      <PageHeader title="Channel audit" subtitle="Prioritised checklist covering description, branding, organisation, homepage layout and upload habits." />
      <ErrorNote error={error} />
      {loading && <Spinner />}
      {a && (
        <div className="space-y-3">
          <Card className="flex flex-wrap gap-4 text-sm">
            <span><strong>{a.summary.todo}</strong> to do</span>
            <span><strong>{a.summary.high}</strong> high priority</span>
            <span><strong>{a.summary.ok}</strong> already good</span>
          </Card>
          {items.map((i) => (
            <Card key={i.id} className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={i.status === "ok" ? "ok" : statusTone(i.priority)}>{i.status === "ok" ? "Good" : i.priority}</Badge>
                <Badge>{i.area}</Badge>
                <h3 className="text-sm font-semibold">{i.title}</h3>
              </div>
              <p className="text-sm text-muted">{i.detail}</p>
            </Card>
          ))}
          <p className="text-xs text-muted">
            Based on {a.basedOn.videosAnalyzed} videos, {a.basedOn.playlists} playlists and {a.basedOn.sections ?? "an unknown number of"} homepage sections · generated {fmtDateTime(a.generatedAt)} ·
            source: YouTube Data API v3. Items are best-practice rules, not guaranteed growth levers.
          </p>
        </div>
      )}
    </>
  );
}
