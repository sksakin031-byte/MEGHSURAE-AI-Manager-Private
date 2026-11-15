import { z } from "zod";
import { route, readJson } from "@/lib/api";
import { ytId } from "@/lib/changes-schema";
import { analyzeSeo } from "@/lib/seo";
import { thumbnailConcepts } from "@/lib/thumbnail-metrics";
import { analyzeThumbnailUrl } from "@/services/thumbnails";
import { badRequest } from "@/lib/errors";
import * as yt from "@/services/youtube";

const body = z.object({ videoId: ytId });

export const POST = route({ perMinute: 15 }, async ({ req, user }) => {
  const { videoId } = body.parse(await readJson(req));
  const video = await yt.getVideo(user.id, videoId);
  if (!video.thumbnailUrl) throw badRequest("This video has no thumbnail URL available.");
  const report = await analyzeThumbnailUrl(video.thumbnailUrl);
  const seo = analyzeSeo({ title: video.title, description: video.description, tags: video.tags });
  return {
    video: { id: video.id, title: video.title, thumbnailUrl: video.thumbnailUrl },
    report,
    concepts: thumbnailConcepts({ title: video.title, keywords: seo.keywords.map((k) => k.keyword), language: seo.language }),
    note: "Analysis uses the thumbnail image YouTube serves, which may be a lower-resolution copy of your original upload.",
  };
});
