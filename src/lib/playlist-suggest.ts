// Pure playlist-grouping heuristic: clusters videos by shared keywords.
import type { Playlist, Video } from "../types";
import { extractKeywords, detectLanguage } from "./seo";

export interface PlaylistSuggestion {
  name: string;
  description: string;
  keyword: string;
  videoIds: string[];
}

const cap = (s: string) => (/[A-Za-z]/.test(s) ? s.replace(/\b\p{L}/gu, (c) => c.toUpperCase()) : s);

export function suggestPlaylists(videos: Video[], existing: Playlist[], opts: { minVideos?: number; max?: number } = {}): PlaylistSuggestion[] {
  const minVideos = opts.minVideos ?? 3;
  const perVideo = new Map<string, Set<string>>();
  const keywordVideos = new Map<string, Set<string>>();
  for (const v of videos) {
    const kws = new Set(extractKeywords([v.title, v.title, v.tags.join(" ")], 6).map((k) => k.keyword));
    perVideo.set(v.id, kws);
    for (const k of kws) {
      if (!keywordVideos.has(k)) keywordVideos.set(k, new Set());
      keywordVideos.get(k)!.add(v.id);
    }
  }
  const existingText = existing.map((p) => p.title.toLowerCase()).join(" | ");
  const candidates = [...keywordVideos.entries()]
    .filter(([k, ids]) => ids.size >= minVideos && !existingText.includes(k))
    .sort((a, b) => b[1].size - a[1].size || b[0].length - a[0].length);

  const used = new Set<string>();
  const out: PlaylistSuggestion[] = [];
  for (const [kw, ids] of candidates) {
    const fresh = [...ids].filter((id) => !used.has(id));
    if (fresh.length < minVideos) continue;
    const lang = detectLanguage(kw);
    out.push({
      keyword: kw,
      name: lang === "bn" ? `${kw} সিরিজ` : `${cap(kw)} Series`,
      description:
        lang === "bn"
          ? `${kw} নিয়ে আমাদের সব ভিডিও এক জায়গায়। ক্রমানুসারে দেখুন।`
          : `All our videos about ${kw} in one place. Watch in order for the best experience.`,
      videoIds: [...ids],
    });
    fresh.forEach((id) => used.add(id));
    if (out.length >= (opts.max ?? 6)) break;
  }
  return out;
}
