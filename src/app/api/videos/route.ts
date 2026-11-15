import { route } from "@/lib/api";
import { getVideosWithSeo } from "@/services/insights";

export const GET = route({ perMinute: 30 }, async ({ user }) => ({
  videos: await getVideosWithSeo(user, 100),
  fetchedAt: new Date().toISOString(),
  source: "YouTube Data API v3 · playlistItems.list + videos.list (cached up to 5 minutes)",
}));
