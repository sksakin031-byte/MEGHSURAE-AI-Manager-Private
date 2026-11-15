import { route } from "@/lib/api";
import { getVideoWithAnalysis } from "@/services/insights";

export const GET = route({ perMinute: 60 }, async ({ user, params }) => ({
  ...(await getVideoWithAnalysis(user, params.id)),
  fetchedAt: new Date().toISOString(),
  source: "YouTube Data API v3 · videos.list",
}));
