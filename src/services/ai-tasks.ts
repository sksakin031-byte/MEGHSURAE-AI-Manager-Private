import { aiComplete, asData, aiStatus } from "@/services/ai";
import { getAudit, getChannel, getVideos } from "@/services/insights";
import { rankPerformance } from "@/lib/strategy";
import { analyzeSeo, extractKeywords, suggestTitleVariants, summarizeCompetitors, detectLanguage, type CompetitorSummary } from "@/lib/seo";
import { searchPublicVideos } from "@/services/youtube";
import { cached } from "@/lib/cache";
import { databaseRateLimit } from "@/lib/rate-limit";
import { tooMany } from "@/lib/errors";
import type { SessionUser } from "@/types";

/** AI-polished SEO suggestions for one video's metadata. Suggestions only: nothing is applied. */
export async function aiSeoSuggestions(input: { title: string; description: string; tags: string[]; goal?: string }) {
  const seo = analyzeSeo(input);
  const variants = suggestTitleVariants({ title: input.title, keywords: seo.keywords.map((k) => k.keyword), language: seo.language });
  const prompt = [
    "Improve the metadata of this YouTube video. Return plain text with these sections:",
    "1) 5 title options (max 70 characters each, keep the video's real topic, no clickbait lies)",
    "2) A rewritten description (first 150 characters must contain the main keyword; include 2-3 hashtags; keep any real links/timestamps)",
    "3) 10-15 tags (mix Bengali and English if the content is Bengali)",
    "4) One sentence on the search intent you are targeting.",
    input.goal ? asData("owner-goal", input.goal, 500) : "",
    asData("title", input.title, 200),
    asData("description", input.description, 3000),
    asData("tags", input.tags.join(", "), 500),
    `Heuristic findings to address: ${seo.suggestions.join(" | ") || "none"}`,
  ].join("\n");
  const ai = await aiComplete({ system: "Task: YouTube SEO copywriting for Bengali and English videos.", prompt, maxTokens: 1500 });
  return { seo, variants, ai: { text: ai.text, provider: ai.provider, model: ai.model } };
}

export async function competitorResearch(user: SessionUser, query: string, opts: { regionCode?: string; relevanceLanguage?: string }): Promise<{ query: string; items: Awaited<ReturnType<typeof searchPublicVideos>>; summary: CompetitorSummary; quotaCost: number }> {
  // search.list costs 100 quota units; protect the 10,000/day free quota.
  const rl = await databaseRateLimit(`competitors:${user.id}`, 5, 3_600_000);
  if (!rl.ok) throw tooMany("Competitor research is limited to 5 searches per hour to protect your YouTube API quota.");
  const key = `u:${user.id}:comp:${query.toLowerCase()}:${opts.regionCode ?? ""}:${opts.relevanceLanguage ?? ""}`;
  const items = await cached(key, 30 * 60_000, () => searchPublicVideos(user.id, query, { ...opts, max: 10 }));
  return { query, items, summary: summarizeCompetitors(items), quotaCost: 101 };
}

/** In-app assistant. Answers questions using the channel's real data as context; it cannot change anything. */
export async function assistantReply(user: SessionUser, message: string): Promise<{ reply: string; provider: string | null; usedAi: boolean }> {
  const [channel, videos] = await Promise.all([getChannel(user), getVideos(user, 50)]);
  const ranked = rankPerformance(videos).slice(0, 5);
  const kws = extractKeywords(videos.slice(0, 30).map((v) => v.title), 8).map((k) => k.keyword);

  if (!aiStatus().configured) {
    const audit = await getAudit(user);
    const todo = audit.items.filter((i) => i.status === "todo").slice(0, 5);
    return {
      usedAi: false,
      provider: null,
      reply:
        "No AI provider is configured, so I can't answer free-form questions. Here is what the built-in analysis found for your channel:\n\n" +
        (todo.length ? todo.map((t) => `• [${t.priority}] ${t.title}: ${t.detail}`).join("\n") : "No open audit items.") +
        "\n\nAdd GEMINI_API_KEY (free tier) to .env to enable the assistant.",
    };
  }

  const context = [
    `Channel: ${channel.title} (${channel.customUrl ?? channel.id})`,
    `Subscribers: ${channel.stats.subscribersHidden ? "hidden" : channel.stats.subscribers ?? "unknown"}; total views: ${channel.stats.views ?? "unknown"}; videos: ${channel.stats.videos ?? "unknown"}`,
    `Frequent title keywords: ${kws.join(", ") || "none"}`,
    `Best recent videos by views/day: ${ranked.map((r) => `${r.title} (${r.viewsPerDay.toFixed(1)}/day)`).join("; ") || "not enough data"}`,
    `Latest titles: ${videos.slice(0, 10).map((v) => v.title).join(" | ")}`,
  ].join("\n");
  const lang = detectLanguage(message);
  const ai = await aiComplete({
    system: `You can only advise; you cannot change the channel. If the owner wants a change made, tell them to prepare it in the Videos or Playlists section so it goes through approval. Answer in ${lang === "bn" ? "Bengali" : "the owner's language"}.`,
    prompt: `${asData("channel-context", context, 3500)}\n\nOwner question:\n${message.slice(0, 1500)}`,
    maxTokens: 1000,
  });
  return { reply: ai.text, provider: ai.provider, usedAi: true };
}

/** Optional AI narrative on top of the deterministic strategy. */
export async function aiStrategyNarrative(summary: string): Promise<{ text: string; provider: string }> {
  const ai = await aiComplete({
    system: "Task: turn a data-derived content plan into short, practical coaching notes (max 200 words).",
    prompt: `${asData("plan", summary, 3500)}\nGive 5 specific recommendations. Do not invent numbers.`,
    maxTokens: 700,
  });
  return { text: ai.text, provider: ai.provider };
}
