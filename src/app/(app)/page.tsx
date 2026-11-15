"use client";
import Link from "next/link";
import { Film, Search, ImageIcon, BarChart3, ListVideo, Sparkles } from "lucide-react";
import { Card, ErrorNote, PageHeader, SourceNote, Spinner, Stat } from "@/components/ui";
import { useApi } from "@/hooks/useApi";
import { fmtDate, fmtNum } from "@/lib/format";
import type { Channel, Video } from "@/types";

const ACTIONS = [
  { href: "/videos", label: "Videos", icon: Film },
  { href: "/seo", label: "SEO workspace", icon: Search },
  { href: "/thumbnails", label: "Thumbnails", icon: ImageIcon },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/playlists", label: "Playlists", icon: ListVideo },
  { href: "/strategy", label: "Strategy", icon: Sparkles },
];

export default function Overview() {
  const ch = useApi<{ channel: Channel }>("/api/channel");
  const vids = useApi<{ videos: Video[]; fetchedAt: string; source: string }>("/api/videos");
  const c = ch.data?.channel;
  return (
    <>
      <PageHeader title="Channel overview" subtitle="Live data from your YouTube channel." />
      <ErrorNote error={ch.error} />
      {ch.loading && <Spinner />}
      {c && (
        <Card>
          <div className="flex items-center gap-4">
            {c.avatarUrl && <img src={c.avatarUrl} alt="" width={64} height={64} className="h-16 w-16 rounded-full border border-line" />}
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold">{c.title}</h2>
              <p className="truncate text-sm text-muted">{c.customUrl ?? c.id}{c.publishedAt ? ` · since ${fmtDate(c.publishedAt)}` : ""}</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <Stat label="Subscribers" value={c.stats.subscribersHidden ? "Hidden" : fmtNum(c.stats.subscribers)} hint="Rounded by YouTube" />
            <Stat label="Total views" value={fmtNum(c.stats.views)} />
            <Stat label="Videos" value={fmtNum(c.stats.videos)} />
          </div>
          <SourceNote source={c.source} fetchedAt={c.fetchedAt} />
        </Card>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {ACTIONS.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className="btn justify-start"><Icon className="h-4 w-4" /> {label}</Link>
        ))}
      </div>

      <h2 className="mb-2 mt-6 font-semibold">Latest uploads</h2>
      <ErrorNote error={vids.error} />
      {vids.loading && <Spinner />}
      {vids.data && (
        <Card className="divide-y divide-line !p-0">
          {vids.data.videos.slice(0, 6).map((v) => (
            <Link key={v.id} href={`/seo?video=${v.id}`} className="flex items-center gap-3 p-3">
              {v.thumbnailUrl && <img src={v.thumbnailUrl} alt="" loading="lazy" className="h-14 w-24 shrink-0 rounded-lg object-cover" />}
              <div className="min-w-0">
                <div className="line-clamp-2 text-sm font-medium">{v.title}</div>
                <div className="text-xs text-muted">{fmtDate(v.publishedAt)} · {fmtNum(v.views)} views</div>
              </div>
            </Link>
          ))}
          {vids.data.videos.length === 0 && <p className="p-4 text-sm text-muted">No uploaded videos found on this channel.</p>}
          <div className="p-3"><SourceNote source={vids.data.source} fetchedAt={vids.data.fetchedAt} /></div>
        </Card>
      )}
    </>
  );
}
