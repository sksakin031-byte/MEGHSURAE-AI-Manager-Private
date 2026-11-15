"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Card, ErrorNote, PageHeader, ScoreBar, SourceNote, Spinner } from "@/components/ui";
import { useApi } from "@/hooks/useApi";
import { fmtDate, fmtDuration, fmtNum } from "@/lib/format";
import type { Video } from "@/types";

type V = Video & { seo: { score: number; language: string } };
type Sort = "new" | "views" | "seo";

export default function VideosPage() {
  const { data, error, loading } = useApi<{ videos: V[]; fetchedAt: string; source: string }>("/api/videos");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("new");
  const list = useMemo(() => {
    const items = (data?.videos ?? []).filter((v) => v.title.toLowerCase().includes(q.toLowerCase()));
    if (sort === "views") items.sort((a, b) => (b.views ?? -1) - (a.views ?? -1));
    else if (sort === "seo") items.sort((a, b) => a.seo.score - b.seo.score);
    else items.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
    return items;
  }, [data, q, sort]);

  return (
    <>
      <PageHeader title="Videos" subtitle="Titles, descriptions, tags and thumbnails of your uploads. SEO score is a rule-based checklist, not a ranking prediction." />
      <div className="mb-3 grid gap-2 sm:grid-cols-[1fr_200px]">
        <input className="input" placeholder="Search titles…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search titles" />
        <select className="input" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort">
          <option value="new">Newest first</option>
          <option value="views">Most views</option>
          <option value="seo">Lowest SEO score first</option>
        </select>
      </div>
      <ErrorNote error={error} />
      {loading && <Spinner />}
      <div className="space-y-3">
        {list.map((v) => (
          <Card key={v.id}>
            <div className="flex gap-3">
              {v.thumbnailUrl && <img src={v.thumbnailUrl} alt="" loading="lazy" className="h-20 w-36 shrink-0 rounded-lg object-cover" />}
              <div className="min-w-0 flex-1">
                <h3 className="line-clamp-2 text-sm font-semibold">{v.title}</h3>
                <p className="mt-1 text-xs text-muted">
                  {fmtDate(v.publishedAt)} · {fmtDuration(v.durationSec)} · {fmtNum(v.views)} views · {v.privacy} · {v.tags.length} tags
                </p>
              </div>
            </div>
            <div className="mt-3"><ScoreBar score={v.seo.score} /></div>
            <div className="mt-3 flex gap-2">
              <Link className="btn flex-1" href={`/seo?video=${v.id}`}>SEO</Link>
              <Link className="btn flex-1" href={`/thumbnails?video=${v.id}`}>Thumbnail</Link>
              <a className="btn flex-1" href={`https://www.youtube.com/watch?v=${v.id}`} target="_blank" rel="noopener noreferrer">Open</a>
            </div>
          </Card>
        ))}
        {data && list.length === 0 && <p className="text-sm text-muted">No videos match.</p>}
      </div>
      {data && <SourceNote source={data.source} fetchedAt={data.fetchedAt} />}
    </>
  );
}
