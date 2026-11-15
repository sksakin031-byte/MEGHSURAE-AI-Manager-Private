import { z } from "zod";
import { route, readJson } from "@/lib/api";
import { buildStrategy } from "@/lib/strategy";
import { getVideos } from "@/services/insights";
import { aiStatus } from "@/services/ai";
import { aiStrategyNarrative } from "@/services/ai-tasks";
import { AppError } from "@/lib/errors";

const body = z.object({
  uploadsPerWeek: z.number().int().min(1).max(7).default(2),
  horizon: z.enum(["weekly", "monthly"]).default("weekly"),
  ai: z.boolean().default(false),
});

export const POST = route({ perMinute: 10 }, async ({ req, user }) => {
  const input = body.parse(await readJson(req));
  const videos = await getVideos(user, 100);
  const strategy = buildStrategy({ videos, uploadsPerWeek: input.uploadsPerWeek, horizon: input.horizon });
  let narrative: { text: string; provider: string } | null = null;
  let aiError: string | null = null;
  if (input.ai) {
    if (!aiStatus().configured) aiError = "No AI provider configured.";
    else {
      try {
        narrative = await aiStrategyNarrative(
          JSON.stringify({ workingKeywords: strategy.basis.workingKeywords, topPerformers: strategy.basis.topPerformers.map((v) => ({ title: v.title, viewsPerDay: Math.round(v.viewsPerDay * 10) / 10 })), uploadsPerWeek: strategy.uploadsPerWeek, ideas: strategy.ideas.slice(0, 6).map((i) => i.title) }),
        );
      } catch (e) {
        aiError = e instanceof AppError ? e.message : "AI request failed.";
      }
    }
  }
  return { strategy, narrative, aiError, source: "Computed from your public/private video statistics via YouTube Data API v3." };
});
