import { z } from "zod";
import { route, readJson } from "@/lib/api";
import { analyzeSeo } from "@/lib/seo";
import { thumbnailConcepts } from "@/lib/thumbnail-metrics";

const body = z.object({ title: z.string().min(2).max(200), description: z.string().max(5000).default("") });

export const POST = route({ perMinute: 30 }, async ({ req }) => {
  const input = body.parse(await readJson(req));
  const seo = analyzeSeo({ title: input.title, description: input.description, tags: [] });
  return { concepts: thumbnailConcepts({ title: input.title, keywords: seo.keywords.map((k) => k.keyword), language: seo.language }) };
});
