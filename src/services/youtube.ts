import { AppError, notFound } from "@/lib/errors";
import { getAccessToken } from "@/services/tokens";
import type { Channel, ChannelSection, Playlist, Video } from "@/types";

const API = "https://www.googleapis.com/youtube/v3";

interface GoogleErrorBody {
  error?: { code?: number; message?: string; errors?: { reason?: string }[] };
}

async function yt<T>(userId: string, path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const token = await getAccessToken(userId);
  const res = await fetch(`${API}/${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await res.json().catch(() => ({}))) as GoogleErrorBody & T;
  if (!res.ok) {
    const reason = json.error?.errors?.[0]?.reason ?? "";
    if (reason === "quotaExceeded" || reason === "rateLimitExceeded") {
      throw new AppError(429, "quota_exceeded", "YouTube API daily quota is used up. It resets at midnight Pacific Time.");
    }
    if (res.status === 401) throw new AppError(401, "reauth_required", "YouTube rejected the access token. Sign in again.");
    if (res.status === 403) {
      throw new AppError(
        403,
        "youtube_forbidden",
        reason === "insufficientPermissions" || reason === "forbidden"
          ? "Google did not grant permission for this action. Reconnect with edit access in Settings."
          : `YouTube denied the request (${reason || "forbidden"}).`,
      );
    }
    if (res.status === 404) throw notFound("YouTube resource not found.");
    throw new AppError(502, "youtube_error", `YouTube API error (${res.status}${reason ? `: ${reason}` : ""}).`);
  }
  return json as T;
}

const num = (v: unknown): number | null => {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Parses an ISO-8601 duration like PT1H2M30S. */
export function parseDuration(iso: string | undefined): number | null {
  if (!iso) return null;
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!m) return null;
  return (Number(m[1] ?? 0) * 86400) + (Number(m[2] ?? 0) * 3600) + (Number(m[3] ?? 0) * 60) + Number(m[4] ?? 0);
}

type Thumbs = Record<string, { url?: string }> | undefined;
function bestThumb(t: Thumbs): string | null {
  return t?.maxres?.url ?? t?.standard?.url ?? t?.high?.url ?? t?.medium?.url ?? t?.default?.url ?? null;
}

interface RawVideo {
  id: string;
  snippet?: {
    title?: string;
    description?: string;
    tags?: string[];
    publishedAt?: string;
    thumbnails?: Thumbs;
    categoryId?: string;
    defaultLanguage?: string;
    defaultAudioLanguage?: string;
  };
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
  contentDetails?: { duration?: string };
  status?: { privacyStatus?: string };
}

function normalizeVideo(v: RawVideo): Video {
  return {
    id: v.id,
    title: v.snippet?.title ?? "",
    description: v.snippet?.description ?? "",
    tags: v.snippet?.tags ?? [],
    publishedAt: v.snippet?.publishedAt ?? null,
    thumbnailUrl: bestThumb(v.snippet?.thumbnails),
    durationSec: parseDuration(v.contentDetails?.duration),
    views: num(v.statistics?.viewCount),
    likes: num(v.statistics?.likeCount), // null when the owner hides likes
    comments: num(v.statistics?.commentCount), // null when comments are disabled
    privacy: v.status?.privacyStatus ?? "unknown",
    categoryId: v.snippet?.categoryId ?? null,
    defaultLanguage: v.snippet?.defaultLanguage ?? v.snippet?.defaultAudioLanguage ?? null,
  };
}

export async function getMyChannel(userId: string): Promise<Channel> {
  const data = await yt<{ items?: Record<string, any>[] }>(
    userId,
    "channels?part=snippet,statistics,brandingSettings,contentDetails&mine=true",
  );
  const c = data.items?.[0];
  if (!c) throw notFound("No YouTube channel found for this Google account.");
  const kw: string = c.brandingSettings?.channel?.keywords ?? "";
  const hidden = Boolean(c.statistics?.hiddenSubscriberCount);
  return {
    id: c.id,
    title: c.snippet?.title ?? "",
    description: c.snippet?.description ?? "",
    customUrl: c.snippet?.customUrl ?? null,
    publishedAt: c.snippet?.publishedAt ?? null,
    country: c.snippet?.country ?? null,
    avatarUrl: bestThumb(c.snippet?.thumbnails),
    bannerUrl: c.brandingSettings?.image?.bannerExternalUrl ?? null,
    keywords: (kw.match(/"[^"]+"|\S+/g) ?? []).map((k) => k.replace(/^"|"$/g, "")),
    trailerVideoId: c.brandingSettings?.channel?.unsubscribedTrailer ?? null,
    uploadsPlaylistId: c.contentDetails?.relatedPlaylists?.uploads ?? null,
    stats: {
      views: num(c.statistics?.viewCount),
      subscribers: hidden ? null : num(c.statistics?.subscriberCount),
      subscribersHidden: hidden,
      videos: num(c.statistics?.videoCount),
    },
    fetchedAt: new Date().toISOString(),
    source: "YouTube Data API v3 · channels.list",
  };
}

const VIDEO_PARTS = "snippet,statistics,contentDetails,status";

export async function getVideosByIds(userId: string, ids: string[]): Promise<Video[]> {
  const out: Video[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const data = await yt<{ items?: RawVideo[] }>(userId, `videos?part=${VIDEO_PARTS}&id=${chunk.map(encodeURIComponent).join(",")}&maxResults=50`);
    out.push(...(data.items ?? []).map(normalizeVideo));
  }
  return out;
}

export async function getVideo(userId: string, id: string): Promise<Video> {
  const [v] = await getVideosByIds(userId, [id]);
  if (!v) throw notFound("Video not found on your channel.");
  return v;
}

/** Lists uploads (newest first) via the uploads playlist: 1 unit per page + 1 unit per 50 videos. */
export async function listVideos(
  userId: string,
  uploadsPlaylistId: string,
  opts: { limit?: number; pageToken?: string } = {},
): Promise<{ videos: Video[]; nextPageToken: string | null }> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 50);
  const q = new URLSearchParams({ part: "contentDetails", playlistId: uploadsPlaylistId, maxResults: String(limit) });
  if (opts.pageToken) q.set("pageToken", opts.pageToken);
  const page = await yt<{ items?: { contentDetails?: { videoId?: string } }[]; nextPageToken?: string }>(userId, `playlistItems?${q}`);
  const ids = (page.items ?? []).map((i) => i.contentDetails?.videoId).filter((x): x is string => Boolean(x));
  const videos = ids.length ? await getVideosByIds(userId, ids) : [];
  const order = new Map(ids.map((id, i) => [id, i]));
  videos.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  return { videos, nextPageToken: page.nextPageToken ?? null };
}

/** Fetches up to `max` most recent videos across pages. */
export async function listAllVideos(userId: string, uploadsPlaylistId: string, max = 150): Promise<Video[]> {
  const all: Video[] = [];
  let token: string | undefined;
  while (all.length < max) {
    const r = await listVideos(userId, uploadsPlaylistId, { limit: 50, pageToken: token });
    all.push(...r.videos);
    if (!r.nextPageToken) break;
    token = r.nextPageToken;
  }
  return all.slice(0, max);
}

interface RawPlaylist {
  id: string;
  snippet?: { title?: string; description?: string; publishedAt?: string; thumbnails?: Thumbs };
  contentDetails?: { itemCount?: number };
  status?: { privacyStatus?: string };
}
const normalizePlaylist = (p: RawPlaylist): Playlist => ({
  id: p.id,
  title: p.snippet?.title ?? "",
  description: p.snippet?.description ?? "",
  itemCount: p.contentDetails?.itemCount ?? 0,
  privacy: p.status?.privacyStatus ?? "unknown",
  publishedAt: p.snippet?.publishedAt ?? null,
  thumbnailUrl: bestThumb(p.snippet?.thumbnails),
});

export async function listPlaylists(userId: string): Promise<Playlist[]> {
  const out: Playlist[] = [];
  let token: string | undefined;
  for (let i = 0; i < 4; i++) {
    const q = new URLSearchParams({ part: "snippet,contentDetails,status", mine: "true", maxResults: "50" });
    if (token) q.set("pageToken", token);
    const d = await yt<{ items?: RawPlaylist[]; nextPageToken?: string }>(userId, `playlists?${q}`);
    out.push(...(d.items ?? []).map(normalizePlaylist));
    if (!d.nextPageToken) break;
    token = d.nextPageToken;
  }
  return out;
}

export async function getPlaylist(userId: string, id: string): Promise<Playlist> {
  const d = await yt<{ items?: RawPlaylist[] }>(userId, `playlists?part=snippet,contentDetails,status&id=${encodeURIComponent(id)}`);
  if (!d.items?.[0]) throw notFound("Playlist not found.");
  return normalizePlaylist(d.items[0]);
}

export async function listPlaylistVideoIds(userId: string, playlistId: string, max = 200): Promise<string[]> {
  const ids: string[] = [];
  let token: string | undefined;
  while (ids.length < max) {
    const q = new URLSearchParams({ part: "contentDetails", playlistId, maxResults: "50" });
    if (token) q.set("pageToken", token);
    const d = await yt<{ items?: { contentDetails?: { videoId?: string } }[]; nextPageToken?: string }>(userId, `playlistItems?${q}`);
    for (const i of d.items ?? []) if (i.contentDetails?.videoId) ids.push(i.contentDetails.videoId);
    if (!d.nextPageToken) break;
    token = d.nextPageToken;
  }
  return ids;
}

export async function listChannelSections(userId: string): Promise<ChannelSection[]> {
  const d = await yt<{ items?: { id: string; snippet?: { type?: string; title?: string } }[] }>(userId, "channelSections?part=snippet&mine=true");
  return (d.items ?? []).map((s) => ({ id: s.id, type: s.snippet?.type ?? "unknown", title: s.snippet?.title ?? null }));
}

/** Public search. Costs 100 quota units per call (default daily quota is 10,000). */
export async function searchPublicVideos(
  userId: string,
  query: string,
  opts: { regionCode?: string; relevanceLanguage?: string; max?: number } = {},
): Promise<{ videoId: string; title: string; channelTitle: string; publishedAt: string | null; tags: string[]; views: number | null }[]> {
  const q = new URLSearchParams({ part: "snippet", type: "video", q: query, maxResults: String(Math.min(opts.max ?? 10, 15)), order: "relevance" });
  if (opts.regionCode) q.set("regionCode", opts.regionCode);
  if (opts.relevanceLanguage) q.set("relevanceLanguage", opts.relevanceLanguage);
  const s = await yt<{ items?: { id?: { videoId?: string }; snippet?: { title?: string; channelTitle?: string; publishedAt?: string } }[] }>(userId, `search?${q}`);
  const ids = (s.items ?? []).map((i) => i.id?.videoId).filter((x): x is string => Boolean(x));
  if (!ids.length) return [];
  const v = await yt<{ items?: RawVideo[] }>(userId, `videos?part=snippet,statistics&id=${ids.join(",")}`);
  const byId = new Map((v.items ?? []).map((x) => [x.id, x]));
  return ids.map((id) => {
    const full = byId.get(id);
    const base = s.items?.find((i) => i.id?.videoId === id)?.snippet;
    return {
      videoId: id,
      title: full?.snippet?.title ?? base?.title ?? "",
      channelTitle: base?.channelTitle ?? "",
      publishedAt: base?.publishedAt ?? null,
      tags: full?.snippet?.tags ?? [],
      views: num(full?.statistics?.viewCount),
    };
  });
}

// ---------------------------------------------------------------------------------------------
// Writes. Only call these from services/changes.ts after the permission check has passed.
// ---------------------------------------------------------------------------------------------

export async function updateVideoMetadata(
  userId: string,
  videoId: string,
  patch: { title?: string; description?: string; tags?: string[] },
): Promise<void> {
  // videos.update replaces the whole snippet, so fetch the live snippet and merge. (50 quota units)
  const d = await yt<{ items?: RawVideo[] }>(userId, `videos?part=snippet&id=${encodeURIComponent(videoId)}`);
  const cur = d.items?.[0]?.snippet;
  if (!cur) throw notFound("Video not found.");
  const snippet: Record<string, unknown> = {
    title: patch.title ?? cur.title,
    description: patch.description ?? cur.description ?? "",
    categoryId: cur.categoryId,
    tags: patch.tags ?? cur.tags ?? [],
  };
  if (cur.defaultLanguage) snippet.defaultLanguage = cur.defaultLanguage;
  if (cur.defaultAudioLanguage) snippet.defaultAudioLanguage = cur.defaultAudioLanguage;
  await yt(userId, "videos?part=snippet", { method: "PUT", body: { id: videoId, snippet } });
}

export async function createPlaylist(
  userId: string,
  input: { title: string; description: string; privacy: "private" | "unlisted" | "public" },
): Promise<{ id: string }> {
  const r = await yt<{ id: string }>(userId, "playlists?part=snippet,status", {
    method: "POST",
    body: { snippet: { title: input.title, description: input.description }, status: { privacyStatus: input.privacy } },
  });
  return { id: r.id };
}

export async function updatePlaylist(userId: string, id: string, patch: { title?: string; description?: string }): Promise<void> {
  const d = await yt<{ items?: RawPlaylist[] }>(userId, `playlists?part=snippet&id=${encodeURIComponent(id)}`);
  const cur = d.items?.[0]?.snippet;
  if (!cur) throw notFound("Playlist not found.");
  await yt(userId, "playlists?part=snippet", {
    method: "PUT",
    body: { id, snippet: { title: patch.title ?? cur.title, description: patch.description ?? cur.description ?? "" } },
  });
}

export async function addVideoToPlaylist(userId: string, playlistId: string, videoId: string): Promise<void> {
  await yt(userId, "playlistItems?part=snippet", {
    method: "POST",
    body: { snippet: { playlistId, resourceId: { kind: "youtube#video", videoId } } },
  });
}
