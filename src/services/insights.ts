import { cached, invalidatePrefix } from "@/lib/cache";
import { badRequest } from "@/lib/errors";
import { analyzeSeo, type SeoAnalysis } from "@/lib/seo";
import { auditChannel, type AuditResult } from "@/lib/channel-audit";
import { db } from "@/lib/db";
import * as yt from "@/services/youtube";
import type { Channel, Playlist, SessionUser, Video } from "@/types";

const TTL = 5 * 60_000;

export const invalidateUserCache = (userId: string) => invalidatePrefix(`u:${userId}:`);

export async function getChannel(user: SessionUser): Promise<Channel> {
  const ch = await cached(`u:${user.id}:channel`, TTL, () => yt.getMyChannel(user.id));
  if (user.channelId !== ch.id || user.channelTitle !== ch.title) {
    await db.user.update({ where: { id: user.id }, data: { channelId: ch.id, channelTitle: ch.title } }).catch(() => undefined);
  }
  return ch;
}

export async function getVideos(user: SessionUser, max = 100): Promise<Video[]> {
  const ch = await getChannel(user);
  if (!ch.uploadsPlaylistId) return [];
  return cached(`u:${user.id}:videos:${max}`, TTL, () => yt.listAllVideos(user.id, ch.uploadsPlaylistId!, max));
}

export const getPlaylists = (user: SessionUser): Promise<Playlist[]> =>
  cached(`u:${user.id}:playlists`, TTL, () => yt.listPlaylists(user.id));

export interface VideoWithSeo extends Video {
  seo: Pick<SeoAnalysis, "score" | "language">;
}

export async function getVideosWithSeo(user: SessionUser, max = 100): Promise<VideoWithSeo[]> {
  const videos = await getVideos(user, max);
  return videos.map((v) => {
    const a = analyzeSeo({ title: v.title, description: v.description, tags: v.tags, durationSec: v.durationSec });
    return { ...v, seo: { score: a.score, language: a.language } };
  });
}

export async function getVideoWithAnalysis(user: SessionUser, videoId: string): Promise<{ video: Video; seo: SeoAnalysis }> {
  if (!/^[A-Za-z0-9_-]{5,64}$/.test(videoId)) throw badRequest("Invalid video id.");
  const video = await yt.getVideo(user.id, videoId);
  return {
    video,
    seo: analyzeSeo({ title: video.title, description: video.description, tags: video.tags, durationSec: video.durationSec }),
  };
}

export async function getAudit(user: SessionUser): Promise<AuditResult> {
  const [channel, videos, playlists] = await Promise.all([getChannel(user), getVideos(user, 50), getPlaylists(user)]);
  const sections = await yt.listChannelSections(user.id).catch(() => null);
  return auditChannel({ channel, videos, playlists, sections });
}
