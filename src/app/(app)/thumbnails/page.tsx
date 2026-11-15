"use client";
import { useEffect, useState } from "react";
import { Copy, ImageIcon } from "lucide-react";
import { Badge, Card, ErrorNote, InfoNote, PageHeader, ScoreBar, Spinner, statusTone } from "@/components/ui";
import { VideoPicker } from "@/components/VideoPicker";
import { useApi } from "@/hooks/useApi";
import { useQueryParam } from "@/hooks/useQueryParam";
import { sendJson } from "@/lib/client";
import type { ThumbnailConcept, ThumbnailReport } from "@/lib/thumbnail-metrics";
import type { Video } from "@/types";

interface Result {
  video: { id: string; title: string; thumbnailUrl: string };
  report: ThumbnailReport;
  concepts: ThumbnailConcept[];
  note: string;
}

export default function ThumbnailsPage() {
  const vids = useApi<{ videos: Video[] }>("/api/videos");
  const preset = useQueryParam("video");
  const [videoId, setVideoId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [res, setRes] = useState<Result | null>(null);
  const [copied, setCopied] = useState<number | null>(null);
  const [customTitle, setCustomTitle] = useState("");
  const [custom, setCustom] = useState<ThumbnailConcept[] | null>(null);

  async function analyze(id: string) {
    setVideoId(id);
    setRes(null);
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      setRes(await sendJson<Result>("/api/thumbnails", { videoId: id }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (preset && vids.data && !videoId) void analyze(preset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, vids.data]);

  async function makeConcepts() {
    setError(null);
    try {
      setCustom((await sendJson<{ concepts: ThumbnailConcept[] }>("/api/thumbnails/concepts", { title: customTitle })).concepts);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }
  async function copy(text: string, idx: number) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(idx);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard unavailable; text is visible for manual copy */
    }
  }

  const concepts = custom ?? res?.concepts ?? [];
  return (
    <>
      <PageHeader title="Thumbnail workspace" subtitle="Pixel-based checks of contrast, colour, detail and mobile legibility, plus concept prompts." />
      <div className="space-y-4">
        <ErrorNote error={vids.error} />
        {vids.loading && <Spinner />}
        {vids.data && <VideoPicker videos={vids.data.videos} value={videoId} onChange={analyze} />}
        {busy && <Spinner label="Analyzing thumbnail…" />}
        <ErrorNote error={error} />

        {res && (
          <Card className="space-y-3">
            <img src={res.video.thumbnailUrl} alt={`Thumbnail of ${res.video.title}`} className="w-full rounded-xl border border-line" />
            <div>
              <div className="mb-1 text-sm font-semibold">Overall heuristic score</div>
              <ScoreBar score={res.report.overall} />
            </div>
            <ul className="space-y-2">
              {res.report.findings.map((f) => (
                <li key={f.id} className="text-sm">
                  <div className="flex flex-wrap items-center gap-2"><Badge tone={statusTone(f.level)}>{f.level}</Badge><strong>{f.label}</strong><span className="text-muted">{f.value}</span></div>
                  <p className="mt-1 text-muted">{f.advice}</p>
                </li>
              ))}
            </ul>
            <InfoNote>{res.report.disclaimer} {res.note} These checks cannot measure click-through rate; compare real CTR in YouTube Studio after changing a thumbnail.</InfoNote>
          </Card>
        )}

        <Card className="space-y-3">
          <h2 className="flex items-center gap-2 font-semibold"><ImageIcon className="h-4 w-4" /> Concepts for any title</h2>
          <div className="flex gap-2">
            <input className="input" placeholder="Video title" value={customTitle} onChange={(e) => setCustomTitle(e.target.value)} aria-label="Video title" />
            <button className="btn btn-primary" disabled={customTitle.trim().length < 2} onClick={makeConcepts}>Generate</button>
          </div>
        </Card>

        {concepts.map((c, i) => (
          <Card key={i} className="space-y-2">
            <h3 className="font-semibold">{c.name}</h3>
            <p className="text-sm text-muted">{c.layout}</p>
            <p className="text-sm">Overlay text: <strong>{c.overlayText}</strong></p>
            <div className="flex gap-1.5">{c.palette.map((p) => <span key={p} title={p} className="h-6 w-6 rounded-full border border-line" style={{ background: p }} />)}</div>
            <p className="rounded-xl bg-bg p-3 text-xs">{c.imagePrompt}</p>
            <button className="btn" onClick={() => copy(c.imagePrompt, i)}><Copy className="h-4 w-4" /> {copied === i ? "Copied" : "Copy image prompt"}</button>
          </Card>
        ))}
      </div>
    </>
  );
}
