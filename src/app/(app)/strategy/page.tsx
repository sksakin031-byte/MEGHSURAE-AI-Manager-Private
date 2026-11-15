"use client";
import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Card, ErrorNote, InfoNote, PageHeader, SourceNote } from "@/components/ui";
import { useApi } from "@/hooks/useApi";
import { sendJson } from "@/lib/client";
import { fmtNum } from "@/lib/format";
import type { Strategy } from "@/lib/strategy";

interface Res {
  strategy: Strategy;
  narrative: { text: string; provider: string } | null;
  aiError: string | null;
  source: string;
}

export default function StrategyPage() {
  const settings = useApi<{ ai: { configured: boolean; provider: string | null } }>("/api/settings");
  const [perWeek, setPerWeek] = useState(2);
  const [horizon, setHorizon] = useState<"weekly" | "monthly">("weekly");
  const [ai, setAi] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [res, setRes] = useState<Res | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      setRes(await sendJson<Res>("/api/strategy", { uploadsPerWeek: perWeek, horizon, ai }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }
  const s = res?.strategy;
  return (
    <>
      <PageHeader title="Content strategy" subtitle="Ideas and an upload plan derived from your own video performance." />
      <Card className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="u">Uploads per week</label>
            <select id="u" className="input" value={perWeek} onChange={(e) => setPerWeek(Number(e.target.value))}>{[1, 2, 3, 4, 5, 6, 7].map((n) => <option key={n}>{n}</option>)}</select>
          </div>
          <div>
            <label className="label" htmlFor="h">Plan length</label>
            <select id="h" className="input" value={horizon} onChange={(e) => setHorizon(e.target.value as "weekly" | "monthly")}><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select>
          </div>
        </div>
        <label className="flex min-h-[44px] items-center gap-2 text-sm">
          <input type="checkbox" className="h-5 w-5" checked={ai} disabled={!settings.data?.ai.configured} onChange={(e) => setAi(e.target.checked)} />
          Add an AI-written growth narrative {settings.data?.ai.configured ? "" : "(no AI key configured)"}
        </label>
        <button className="btn btn-primary w-full" disabled={busy} onClick={run}><Sparkles className="h-4 w-4" /> {busy ? "Building…" : "Generate strategy"}</button>
        <ErrorNote error={error} />
      </Card>

      {s && res && (
        <div className="mt-4 space-y-4">
          <Card className="space-y-2">
            <h2 className="font-semibold">What the data says</h2>
            <p className="text-sm text-muted">Based on {s.basis.videosConsidered} videos. Top performers by views per day since publishing:</p>
            <ul className="space-y-1 text-sm">{s.basis.topPerformers.map((v) => <li key={v.id}>{v.title} <span className="text-muted">· {fmtNum(Math.round(v.viewsPerDay * 10) / 10)} views/day · {v.ageDays}d old</span></li>)}</ul>
            {s.basis.workingKeywords.length > 0 && <div className="flex flex-wrap gap-1.5">{s.basis.workingKeywords.map((k) => <span key={k} className="pill">{k}</span>)}</div>}
          </Card>
          <Card className="space-y-2">
            <h2 className="font-semibold">Content ideas</h2>
            {s.ideas.map((i) => (
              <div key={i.title} className="rounded-xl border border-line p-3 text-sm">
                <div className="font-medium">{i.title}</div>
                <div className="text-muted">{i.why}</div>
                <div className="text-xs text-muted">Angle: {i.angle}</div>
              </div>
            ))}
          </Card>
          <Card className="space-y-2">
            <h2 className="font-semibold">{s.horizon === "weekly" ? "Weekly" : "Monthly"} plan · {s.uploadsPerWeek} upload(s)/week</h2>
            <ul className="divide-y divide-line text-sm">{s.plan.map((p, i) => <li key={i} className="flex gap-3 py-2"><span className="w-24 shrink-0 text-muted">{p.weekday} {p.date.slice(5)}</span><span><strong className="capitalize">{p.type}</strong> — {p.task}</span></li>)}</ul>
          </Card>
          <Card className="space-y-2">
            <h2 className="font-semibold">SEO checklist for each upload</h2>
            <ul className="list-disc space-y-1 pl-5 text-sm">{s.checklist.map((c) => <li key={c}>{c}</li>)}</ul>
          </Card>
          {res.narrative && <Card><h2 className="mb-1 font-semibold">AI narrative ({res.narrative.provider})</h2><p className="whitespace-pre-wrap break-words text-sm">{res.narrative.text}</p></Card>}
          <ErrorNote error={res.aiError} />
          <InfoNote>{s.caveats.join(" ")}</InfoNote>
          <SourceNote source={res.source} />
        </div>
      )}
    </>
  );
}
