"use client";
import { useEffect, useMemo, useState } from "react";
import { Search, Sparkles } from "lucide-react";
import { Badge, Card, ErrorNote, InfoNote, PageHeader, ScoreBar, Spinner, statusTone } from "@/components/ui";
import { ProposeButtons } from "@/components/ProposeButtons";
import { VideoPicker } from "@/components/VideoPicker";
import { useApi } from "@/hooks/useApi";
import { useQueryParam } from "@/hooks/useQueryParam";
import { sendJson } from "@/lib/client";
import { fmtNum, parseTags } from "@/lib/format";
import type { SeoAnalysis, TitleVariant, CompetitorSummary } from "@/lib/seo";
import type { Video } from "@/types";

interface SeoResult {
  seo: SeoAnalysis;
  variants: TitleVariant[];
  ai: { text: string; provider: string; model: string } | null;
  aiError: string | null;
}
interface Competitors {
  query: string;
  items: { title: string; channelTitle: string; tags: string[]; views: number | null }[];
  summary: CompetitorSummary;
  quotaCost: number;
}

export default function SeoPage() {
  const [tab, setTab] = useState<"video" | "competitors">("video");
  return (
    <>
      <PageHeader title="SEO workspace" subtitle="Bengali and English checks, keyword ideas and metadata drafts. Suggestions are starting points to edit; they do not guarantee ranking." />
      <div className="mb-4 grid grid-cols-2 gap-2" role="tablist">
        <button role="tab" aria-selected={tab === "video"} className={`btn ${tab === "video" ? "btn-primary" : ""}`} onClick={() => setTab("video")}>Video SEO</button>
        <button role="tab" aria-selected={tab === "competitors"} className={`btn ${tab === "competitors" ? "btn-primary" : ""}`} onClick={() => setTab("competitors")}>Competitor research</button>
      </div>
      {tab === "video" ? <VideoSeo /> : <CompetitorTab />}
    </>
  );
}

function VideoSeo() {
  const vids = useApi<{ videos: Video[] }>("/api/videos");
  const settings = useApi<{ ai: { configured: boolean; provider: string | null; freeTier: boolean } }>("/api/settings");
  const preset = useQueryParam("video");
  const [videoId, setVideoId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [focus, setFocus] = useState("");
  const [goal, setGoal] = useState("");
  const [useAi, setUseAi] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [res, setRes] = useState<SeoResult | null>(null);

  const video = vids.data?.videos.find((v) => v.id === videoId) ?? null;

  function select(id: string) {
    setVideoId(id);
    setRes(null);
    const v = vids.data?.videos.find((x) => x.id === id);
    if (v) {
      setTitle(v.title);
      setDescription(v.description);
      setTagsText(v.tags.join(", "));
    }
  }
  useEffect(() => {
    if (preset && vids.data && !videoId) select(preset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, vids.data]);

  async function analyze() {
    setBusy(true);
    setError(null);
    try {
      setRes(await sendJson<SeoResult>("/api/seo", { title, description, tags: parseTags(tagsText), focusKeyword: focus || undefined, goal: goal || undefined, ai: useAi }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setBusy(false);
    }
  }

  const change = useMemo(() => {
    if (!video) return null;
    const tags = parseTags(tagsText);
    const c: Record<string, unknown> = { kind: "video_metadata", videoId: video.id };
    if (title !== video.title) c.title = title;
    if (description !== video.description) c.description = description;
    if (tags.join("\u0000") !== video.tags.join("\u0000")) c.tags = tags;
    return Object.keys(c).length > 2 ? c : null;
  }, [video, title, description, tagsText]);

  const ai = settings.data?.ai;
  return (
    <div className="space-y-4">
      <ErrorNote error={vids.error} />
      {vids.loading && <Spinner />}
      {vids.data && <VideoPicker videos={vids.data.videos} value={videoId} onChange={select} />}

      <Card className="space-y-3">
        <div>
          <label className="label" htmlFor="t">Title ({[...title].length}/100)</label>
          <input id="t" className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="d">Description</label>
          <textarea id="d" className="input min-h-[140px] py-2" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="tg">Tags (comma separated)</label>
          <textarea id="tg" className="input min-h-[72px] py-2" value={tagsText} onChange={(e) => setTagsText(e.target.value)} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="f">Focus keyword (optional)</label>
            <input id="f" className="input" value={focus} onChange={(e) => setFocus(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="g">Goal for AI (optional)</label>
            <input id="g" className="input" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="e.g. reach beginners" />
          </div>
        </div>
        <label className="flex min-h-[44px] items-center gap-2 text-sm">
          <input type="checkbox" className="h-5 w-5" checked={useAi} disabled={!ai?.configured} onChange={(e) => setUseAi(e.target.checked)} />
          Also ask AI for rewrite ideas {ai?.configured ? `(${ai.provider}${ai.freeTier ? ", free tier" : ", paid API"})` : "(no AI key configured — heuristic mode only)"}
        </label>
        <button className="btn btn-primary w-full" onClick={analyze} disabled={busy || !title.trim()}>
          <Search className="h-4 w-4" /> {busy ? "Analyzing…" : "Analyze SEO"}
        </button>
        <ErrorNote error={error} />
      </Card>

      {res && (
        <>
          <Card className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold">SEO checklist score</h2>
              <Badge>{res.seo.language === "bn" ? "Bengali" : res.seo.language === "en" ? "English" : "Mixed language"}</Badge>
              <Badge tone="brand">Intent: {res.seo.intent.intent}</Badge>
            </div>
            <ScoreBar score={res.seo.score} />
            <ul className="space-y-2">
              {res.seo.checks.map((c) => (
                <li key={c.id} className="flex items-start gap-2 text-sm">
                  <Badge tone={statusTone(c.status)}>{c.status}</Badge>
                  <span><strong>{c.label}.</strong> <span className="text-muted">{c.detail}</span></span>
                </li>
              ))}
            </ul>
            <InfoNote>Method: {res.seo.method} rules on the text you entered. No search-volume or ranking data is used or implied.</InfoNote>
          </Card>

          <Card className="space-y-3">
            <h2 className="font-semibold">Keywords, hashtags and tags</h2>
            <div className="flex flex-wrap gap-1.5">{res.seo.keywords.map((k) => <span key={k.keyword} className="pill">{k.keyword}</span>)}</div>
            {res.seo.hashtags.length > 0 && <p className="text-sm text-brand">{res.seo.hashtags.join(" ")}</p>}
            {res.seo.suggestedTags.length > 0 && (
              <button className="btn" onClick={() => setTagsText(Array.from(new Set([...parseTags(tagsText), ...res.seo.suggestedTags])).join(", "))}>
                Add {res.seo.suggestedTags.length} suggested tags
              </button>
            )}
            {res.seo.suggestions.length > 0 && <ul className="list-disc space-y-1 pl-5 text-sm text-muted">{res.seo.suggestions.map((s) => <li key={s}>{s}</li>)}</ul>}
          </Card>

          {res.variants.length > 0 && (
            <Card className="space-y-2">
              <h2 className="font-semibold">Title ideas</h2>
              {res.variants.map((v) => (
                <button key={v.title} className="btn h-auto w-full flex-col items-start !py-2 text-left" onClick={() => setTitle(v.title)}>
                  <span className="font-medium">{v.title}</span>
                  <span className="text-xs font-normal text-muted">{v.note} · tap to use</span>
                </button>
              ))}
            </Card>
          )}

          {(res.ai || res.aiError) && (
            <Card className="space-y-2">
              <h2 className="flex items-center gap-2 font-semibold"><Sparkles className="h-4 w-4" /> AI suggestions</h2>
              <ErrorNote error={res.aiError} />
              {res.ai && (
                <>
                  <p className="whitespace-pre-wrap break-words text-sm">{res.ai.text}</p>
                  <p className="text-xs text-muted">Generated by {res.ai.provider} ({res.ai.model}). Review before using: AI output can be wrong.</p>
                </>
              )}
            </Card>
          )}
        </>
      )}

      {video && (
        <Card className="space-y-2">
          <h2 className="font-semibold">Apply to YouTube</h2>
          <p className="text-sm text-muted">{change ? `Changed fields: ${Object.keys(change).filter((k) => k !== "kind" && k !== "videoId").join(", ")}.` : "Edit the title, description or tags above to prepare a change."}</p>
          <ProposeButtons change={change} />
        </Card>
      )}
    </div>
  );
}

function CompetitorTab() {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [res, setRes] = useState<Competitors | null>(null);
  async function run() {
    setBusy(true);
    setError(null);
    try {
      setRes(await sendJson<Competitors>("/api/seo/competitors", { query }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <label className="label" htmlFor="cq">Keyword or topic</label>
        <input id="cq" className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. রান্নার রেসিপি" />
        <button className="btn btn-primary w-full" disabled={busy || query.trim().length < 2} onClick={run}>{busy ? "Searching…" : "Research top public videos"}</button>
        <InfoNote>Uses the official YouTube search API on public data only (about 101 of your 10,000 daily quota units per search; limited to 5 searches per hour). It shows patterns in a small sample, not search volume.</InfoNote>
        <ErrorNote error={error} />
      </Card>
      {res && (
        <>
          <Card className="space-y-2">
            <h2 className="font-semibold">Patterns in {res.summary.sampleSize} videos</h2>
            <div className="flex flex-wrap gap-1.5">{res.summary.commonKeywords.map((k) => <span key={k.keyword} className="pill">{k.keyword}</span>)}</div>
            {res.summary.commonTags.length > 0 && <p className="text-sm text-muted">Common tags: {res.summary.commonTags.map((t) => `${t.tag} (${t.count})`).join(", ")}</p>}
            <p className="text-sm text-muted">Average title length: {res.summary.avgTitleLength ?? "Unavailable"} · question-style titles: {res.summary.patterns.questionTitles} · titles with numbers: {res.summary.patterns.numberTitles}</p>
            <p className="text-xs text-muted">{res.summary.caveat}</p>
          </Card>
          <Card className="divide-y divide-line !p-0">
            {res.items.map((i, idx) => (
              <div key={idx} className="p-3 text-sm">
                <div className="font-medium">{i.title}</div>
                <div className="text-xs text-muted">{i.channelTitle} · {fmtNum(i.views)} views</div>
              </div>
            ))}
          </Card>
        </>
      )}
    </div>
  );
}
