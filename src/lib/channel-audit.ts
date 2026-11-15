// Pure channel audit: turns fetched channel facts into a prioritized checklist.
import type { Channel, ChannelSection, Playlist, Video } from "../types";

export type Priority = "high" | "medium" | "low";
export interface AuditItem {
  id: string;
  priority: Priority;
  area: "description" | "branding" | "organization" | "homepage" | "content";
  status: "ok" | "todo";
  title: string;
  detail: string;
}

export interface AuditResult {
  items: AuditItem[];
  summary: { todo: number; ok: number; high: number };
  basedOn: { videosAnalyzed: number; playlists: number; sections: number | null };
  generatedAt: string;
}

function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function uploadGapsDays(videos: Video[]): number[] {
  const t = videos.map((v) => (v.publishedAt ? Date.parse(v.publishedAt) : NaN)).filter((x) => !Number.isNaN(x)).sort((a, b) => b - a);
  const gaps: number[] = [];
  for (let i = 0; i < t.length - 1; i++) gaps.push((t[i] - t[i + 1]) / 86_400_000);
  return gaps;
}

export function auditChannel(input: {
  channel: Channel;
  videos: Video[];
  playlists: Playlist[];
  sections: ChannelSection[] | null;
  now?: Date;
}): AuditResult {
  const { channel, videos, playlists, sections } = input;
  const items: AuditItem[] = [];
  const add = (i: AuditItem) => items.push(i);
  const ok = (cond: boolean) => (cond ? "ok" : "todo") as "ok" | "todo";

  const dl = channel.description.trim().length;
  add({ id: "channel-description", priority: "high", area: "description", status: ok(dl >= 250), title: "Channel description", detail: dl >= 250 ? `${dl} characters.` : `Only ${dl} characters. Explain who the channel is for, what you upload, and your schedule, with main keywords near the start (Bengali and English if your audience searches in both).` });
  add({ id: "channel-keywords", priority: "medium", area: "description", status: ok(channel.keywords.length >= 3), title: "Channel keywords", detail: channel.keywords.length >= 3 ? `${channel.keywords.length} keywords set.` : "Few or no channel keywords set in YouTube Studio > Customization > Basic info." });
  add({ id: "banner", priority: "medium", area: "branding", status: ok(Boolean(channel.bannerUrl)), title: "Channel banner", detail: channel.bannerUrl ? "Banner present. Check that key content sits inside the safe area for mobile." : "No banner image found. Add one (2048×1152, keep text in the central safe area)." });
  add({ id: "trailer", priority: "low", area: "homepage", status: ok(Boolean(channel.trailerVideoId)), title: "Channel trailer for non-subscribers", detail: channel.trailerVideoId ? "Trailer set." : "No trailer set for non-subscribers. A 30–60s intro can improve conversion." });

  if (sections) {
    const types = new Set(sections.map((s) => s.type));
    add({ id: "sections", priority: "medium", area: "homepage", status: ok(sections.length >= 2), title: "Homepage sections", detail: sections.length >= 2 ? `${sections.length} sections configured (${[...types].join(", ")}).` : "Homepage has 0–1 sections. Add e.g. a featured playlist or popular uploads so new visitors find content quickly." });
    add({ id: "playlist-sections", priority: "low", area: "homepage", status: ok([...types].some((t) => /playlist/i.test(t))), title: "Playlists on the homepage", detail: [...types].some((t) => /playlist/i.test(t)) ? "At least one playlist section is shown." : "No playlist shelves on the homepage." });
  }

  const played = playlists.reduce((n, p) => n + p.itemCount, 0);
  add({ id: "playlists", priority: "medium", area: "organization", status: ok(playlists.length >= 2), title: "Playlists", detail: playlists.length >= 2 ? `${playlists.length} playlists (${played} playlist entries).` : "Few playlists. Group videos by topic or series to increase session time." });
  const poor = playlists.filter((p) => p.description.trim().length < 50);
  if (playlists.length) add({ id: "playlist-descriptions", priority: "low", area: "organization", status: ok(poor.length === 0), title: "Playlist descriptions", detail: poor.length === 0 ? "All playlists have descriptions." : `${poor.length} of ${playlists.length} playlists have no meaningful description.` });

  if (videos.length) {
    const noTags = videos.filter((v) => v.tags.length === 0).length;
    const shortDesc = videos.filter((v) => v.description.trim().length < 100).length;
    const longTitle = videos.filter((v) => v.title.length > 70).length;
    add({ id: "video-descriptions", priority: "high", area: "content", status: ok(shortDesc / videos.length < 0.2), title: "Video descriptions", detail: `${shortDesc} of ${videos.length} analyzed videos have under 100 characters. Descriptions help search and suggested placement.` });
    add({ id: "video-tags", priority: "low", area: "content", status: ok(noTags / videos.length < 0.3), title: "Video tags", detail: `${noTags} of ${videos.length} analyzed videos have no tags (low impact, but cheap to fix).` });
    add({ id: "title-length", priority: "medium", area: "content", status: ok(longTitle / videos.length < 0.25), title: "Title length", detail: `${longTitle} of ${videos.length} analyzed titles exceed 70 characters and may be truncated.` });
    const med = median(uploadGapsDays(videos.slice(0, 20)));
    if (med !== null) {
      const lastPub = videos[0]?.publishedAt ? Date.parse(videos[0].publishedAt) : null;
      const now = (input.now ?? new Date()).getTime();
      const sinceLast = lastPub ? (now - lastPub) / 86_400_000 : null;
      const stale = sinceLast !== null && sinceLast > Math.max(14, med * 3);
      add({ id: "consistency", priority: "medium", area: "content", status: ok(!stale), title: "Upload consistency", detail: `Median gap between recent uploads: ${med.toFixed(1)} days.${sinceLast !== null ? ` Last upload was ${Math.floor(sinceLast)} days ago.` : ""}${stale ? " The current gap is much longer than usual." : ""}` });
    }
  }

  const order: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
  items.sort((a, b) => (a.status === b.status ? order[a.priority] - order[b.priority] : a.status === "todo" ? -1 : 1));
  return {
    items,
    summary: { todo: items.filter((i) => i.status === "todo").length, ok: items.filter((i) => i.status === "ok").length, high: items.filter((i) => i.status === "todo" && i.priority === "high").length },
    basedOn: { videosAnalyzed: videos.length, playlists: playlists.length, sections: sections ? sections.length : null },
    generatedAt: new Date().toISOString(),
  };
}
