import { route } from "@/lib/api";
import { suggestPlaylists } from "@/lib/playlist-suggest";
import { getPlaylists, getVideos } from "@/services/insights";

export const GET = route({ perMinute: 30 }, async ({ user }) => {
  const [playlists, videos] = await Promise.all([getPlaylists(user), getVideos(user, 100)]);
  return {
    playlists,
    suggestions: suggestPlaylists(videos, playlists),
    suggestionMethod: "Groups your videos by shared title/tag keywords (heuristic). Review before creating.",
    fetchedAt: new Date().toISOString(),
    source: "YouTube Data API v3 · playlists.list",
  };
});
