import { z } from "zod";
import { route, readJson } from "@/lib/api";
import { analyzeSeo, suggestTitleVariants } from "@/lib/seo";
import { aiSeoSuggestions } from "@/services/ai-tasks";
import { aiStatus } from "@/services/ai";
import { AppError } from "@/lib/errors";

const body = z.object({
  title: z.string().max(300),
  description: z.string().max(8000).default(""),
  tags: z.array(z.string().max(100)).max(80).default([]),
  language: z.enum(["bn", "en", "mixed"]).optional(),
  focusKeyword: z.string().max(100).optional(),
  ai: z.boolean().default(false),
  goal: z.string().max(500).optional(),
});

export const POST = route({ perMinute: 20 }, async ({ req }) => {
  const input = body.parse(await readJson(req));
  const seo = analyzeSeo(input);
  const variants = suggestTitleVariants({ title: input.title, keywords: seo.keywords.map((k) => k.keyword), language: seo.language });
  let ai: { text: string; provider: string; model: string } | null = null;
  let aiError: string | null = null;
  if (input.ai) {
    if (!aiStatus().configured) {
      aiError = "No AI provider configured. Add GEMINI_API_KEY (free tier) to .env.";
    } else {
      try {
        ai = (await aiSeoSuggestions(input)).ai;
      } catch (e) {
        aiError = e instanceof AppError ? e.message : "AI request failed.";
      }
    }
  }
  return { seo, variants, ai, aiError };
});
