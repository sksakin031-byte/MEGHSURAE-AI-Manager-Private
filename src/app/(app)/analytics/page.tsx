"use client";
import { useState } from "react";
import { Badge, Card, ErrorNote, InfoNote, PageHeader, SourceNote, Spinner } from "@/components/ui";
import { useApi } from "@/hooks/useApi";
import { fmtDuration, fmtNum } from "@/lib/format";
import type { AnalyticsOverview, Metric, MetricPair, Video } from "@/types";

type Key = keyof AnalyticsOverview["metrics"];
const LABELS: { key: Key; label: string; fmt: (n: number) => string }[] = [
  { key: "views", label: "Views", fmt: (n) => fmtNum(n) },
  { key: "watchTimeMinutes", label: "Watch time", fmt: (n) => `${fmtNum(Math.round((n / 60) * 10) / 10)} h` },
  { key: "avgViewDurationSec", label: "Avg. view duration", fmt: (n) => fmtDuration(n) },
  { key: "subscribersNet", label: "Net subscribers", fmt: (n) => (n > 0 ? "+" : "") + fmtNum(n) },
  { key: "impressions", label: "Impressions", fmt: (n) => fmtNum(n) },
  { key: "ctrPercent", label: "Impressions CTR", fmt: (n) => `${n.toFixed(2)}%` },
  { key: "likes", label: "Likes", fmt: (n) => fmtNum(n) },
  { key: "comments", label: "Comments", fmt: (n) => fmtNum(n) },
];

function Value({ m, fmt }: { m: Metric; fmt: (n: number) => string }) {
  // "Unavailable" is deliberately different from 0.
  return m.available ? <>{fmt(m.value)}</> : <span className="text-muted" title={m.reason}>Unavailable</span>;
}

function Tile({ label, pair, fmt }: { label: string; pair: MetricPair; fmt: (n: number) => string }) {
  const unavailable = !pair.current.available ? pair.current.reason : null;
  return (
    <div className="card !p-3">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums"><Value m={pair.current} fmt={fmt} /></div>
      {unavailable ? (
        <div className="mt-1 text-[11px] leading-snug text-muted">{unavailable}</div>
      ) : (
        <div className="mt-1 flex items-center gap-2 text-xs text-muted">
          <span>prev: <Value m={pair.previous} fmt={fmt} /></span>
          {pair.changePct !== null && <Badge tone={pair.changePct >= 0 ? "ok" : "danger"}>{pair.changePct >= 0 ? "+" : ""}{pair.changePct.toFixed(1)}%</Badge>}
        </div>
      )}
    </div>
  );
}

export default function AnalyticsPage() {
  const [days, setDays] = useState(28);
  const { data, error, loading } = useApi<{ analytics: AnalyticsOverview }>(`/api/analytics?days=${days}`);
  const vids = useApi<{ videos: Video[] }>("/api/videos");
  const a = data?.analytics;
  const max = Math.max(1, ...(a?.daily?.map((d) => d.views) ?? [1]));
  const title = (id: string) => vids.data?.videos.find((v) => v.id === id)?.title ?? id;

  return (
    <>
      <PageHeader
        title="Analytics"
        subtitle="Verified numbers from the YouTube Analytics API, compared with the previous period of equal length."
        actions={
          <select className="input !w-auto" value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Date range">
            <option value={7}>Last 7 days</option><option value={28}>Last 28 days</option><option value={90}>Last 90 days</option>
          </select>
        }
      />
      <ErrorNote error={error} />
      {loading && <Spinner />}
      {a && (
        <div className="space-y-4">
          <p className="text-sm text-muted">{a.period.start} → {a.period.end} vs {a.previousPeriod.start} → {a.previousPeriod.end}</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {LABELS.map((l) => <Tile key={l.key} label={l.label} pair={a.metrics[l.key]} fmt={l.fmt} />)}
          </div>

          <Card>
            <h2 className="mb-2 font-semibold">Daily views</h2>
            {a.daily ? (
              <>
                <div className="flex h-32 items-end gap-px" role="img" aria-label={`Daily views, maximum ${max}`}>
                  {a.daily.map((d) => <div key={d.date} title={`${d.date}: ${d.views}`} className="min-w-[2px] flex-1 rounded-t bg-brand" style={{ height: `${Math.max(2, (d.views / max) * 100)}%` }} />)}
                </div>
                <div className="mt-1 flex justify-between text-[11px] text-muted"><span>{a.daily[0]?.date}</span><span>{a.daily[a.daily.length - 1]?.date}</span></div>
              </>
            ) : <p className="text-sm text-muted">Unavailable: {a.dailyReason}</p>}
          </Card>

          <Card>
            <h2 className="mb-2 font-semibold">Top videos in this period</h2>
            {a.topVideos ? (
              <ul className="divide-y divide-line">
                {a.topVideos.map((v) => (
                  <li key={v.videoId} className="py-2 text-sm">
                    <div className="line-clamp-2 font-medium">{title(v.videoId)}</div>
                    <div className="text-xs text-muted">{fmtNum(v.views)} views · {fmtNum(Math.round((v.watchTimeMinutes / 60) * 10) / 10)} h watched · avg {fmtDuration(v.avgViewDurationSec)}</div>
                  </li>
                ))}
                {a.topVideos.length === 0 && <li className="py-2 text-sm text-muted">No video data returned for this period.</li>}
              </ul>
            ) : <p className="text-sm text-muted">Unavailable: {a.topVideosReason}</p>}
          </Card>

          {a.notes.length > 0 && <InfoNote>{a.notes.join(" ")}</InfoNote>}
          <SourceNote source={a.source} fetchedAt={a.fetchedAt} />
        </div>
      )}
    </>
  );
}
