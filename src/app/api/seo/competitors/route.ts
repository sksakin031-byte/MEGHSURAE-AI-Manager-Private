import { z } from "zod";
import { route, readJson } from "@/lib/api";
import { competitorResearch } from "@/services/ai-tasks";

const body = z.object({
  query: z.string().trim().min(2).max(100),
  regionCode: z.string().length(2).toUpperCase().optional(),
  relevanceLanguage: z.string().min(2).max(5).optional(),
});

/** Uses the official YouTube search API on public data only. Costs ~101 quota units per fresh search. */
export const POST = route({ perMinute: 10 }, async ({ req, user }) => {
  const input = body.parse(await readJson(req));
  return competitorResearch(user, input.query, { regionCode: input.regionCode, relevanceLanguage: input.relevanceLanguage });
});
