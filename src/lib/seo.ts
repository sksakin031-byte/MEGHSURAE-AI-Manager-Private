// Pure, deterministic SEO heuristics (no network, no framework imports). Safe to unit test.
// These are rule-of-thumb checks, NOT ranking guarantees. YouTube's ranking system is not public.
import { byteLength, tagsLength, LIMITS } from "./youtube-limits";

export type Lang = "bn" | "en" | "mixed";

const EN_STOP = new Set(
  "a an and are as at be but by for from has have how i in is it its of on or our so that the their them then there these they this to was we what when where which who why will with you your about into over under more most can do does did not no yes if than too very just also get got make made new".split(" "),
);
const BN_STOP = new Set(
  "এই এটি ও এবং যে কি কী না তা তার করে করা হয় থেকে জন্য সাথে একটি আমি আমার তুমি আপনি আমরা এর হবে নিয়ে আর তো বা কিন্তু এক কোন যা যদি তারা তাদের আছে ছিল হয়েছে হচ্ছে দিয়ে পর মধ্যে সব আরও খুব".split(" "),
);

const WORD = /[\p{L}\p{M}\p{N}]+/gu;
const BN_CHAR = /[ঀ-৿]/g;
const BN_TEST = /[ঀ-৿]/; // non-global: safe for repeated .test()
const LATIN_CHAR = /[A-Za-z]/g;

export function detectLanguage(text: string): Lang {
  const bn = (text.match(BN_CHAR) ?? []).length;
  const en = (text.match(LATIN_CHAR) ?? []).length;
  if (bn === 0 && en === 0) return "en";
  const ratio = bn / (bn + en);
  if (ratio > 0.7) return "bn";
  if (ratio < 0.15) return "en";
  return "mixed";
}

export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(WORD) ?? []).filter((w) => !/^\d+$/.test(w));
}

function isStop(w: string): boolean {
  return EN_STOP.has(w) || BN_STOP.has(w);
}

function minLen(w: string): number {
  return BN_TEST.test(w) ? 2 : 3;
}

export interface Keyword {
  keyword: string;
  score: number;
}

/** Frequency-based keyword/phrase extraction across several texts (title weighted by caller via repetition). */
export function extractKeywords(texts: string[], limit = 10): Keyword[] {
  const counts = new Map<string, number>();
  for (const text of texts) {
    const words = tokenize(text);
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      if (isStop(w) || w.length < minLen(w)) continue;
      counts.set(w, (counts.get(w) ?? 0) + 1);
      const n = words[i + 1];
      if (n && !isStop(n) && n.length >= minLen(n)) {
        const bg = `${w} ${n}`;
        counts.set(bg, (counts.get(bg) ?? 0) + 1.5);
      }
    }
  }
  const ranked = [...counts.entries()]
    .map(([keyword, score]) => ({ keyword, score }))
    .sort((a, b) => b.score - a.score || b.keyword.length - a.keyword.length);
  // Drop unigrams fully covered by a higher-scoring phrase that contains them.
  const out: Keyword[] = [];
  for (const k of ranked) {
    if (!k.keyword.includes(" ") && out.some((o) => o.keyword.includes(" ") && o.keyword.split(" ").includes(k.keyword) && o.score >= k.score)) continue;
    out.push(k);
    if (out.length >= limit) break;
  }
  return out;
}

export type Intent = "how-to" | "informational" | "review" | "comparison" | "listicle" | "general";

const INTENT_RULES: { intent: Intent; re: RegExp }[] = [
  { intent: "comparison", re: /\b(vs|versus|compare|comparison|better than)\b|তুলনা|নাকি/i },
  { intent: "review", re: /\b(review|unboxing|worth it|honest)\b|রিভিউ|আনবক্সিং/i },
  { intent: "how-to", re: /\b(how to|tutorial|guide|step by step|learn)\b|কিভাবে|কীভাবে|টিউটোরিয়াল|শিখুন|শিখে নিন/i },
  { intent: "listicle", re: /\b(top \d+|best \d+|\d+ (ways|tips|things|ideas|reasons))\b|সেরা \d+|\d+টি/i },
  { intent: "informational", re: /\b(what is|why|explained|meaning|history)\b|কেন|কী\?|কি\?|কাকে বলে|ইতিহাস/i },
];

export function classifyIntent(text: string): { intent: Intent; note: string } {
  for (const r of INTENT_RULES) if (r.re.test(text)) return { intent: r.intent, note: "Matched wording patterns in the text (heuristic)." };
  return { intent: "general", note: "No strong intent wording found. Entertainment/general content often relies on the thumbnail and title curiosity." };
}

export function buildHashtags(keywords: string[], count = 3): string[] {
  const tags: string[] = [];
  for (const k of keywords) {
    const joined = k.replace(/[^\p{L}\p{M}\p{N}\s]/gu, "").trim().split(/\s+/).join("");
    if (joined.length < 2 || joined.length > 30) continue;
    const tag = `#${/[A-Za-z]/.test(joined) ? joined.toLowerCase() : joined}`;
    if (!tags.includes(tag)) tags.push(tag);
    if (tags.length >= count) break;
  }
  return tags;
}

export function suggestTags(input: { title: string; description: string; existing: string[]; limit?: number }): string[] {
  const kws = extractKeywords([input.title, input.title, input.description], 20).map((k) => k.keyword);
  const merged: string[] = [];
  for (const t of [...input.existing, ...kws]) {
    const clean = t.trim();
    if (clean && !merged.some((m) => m.toLowerCase() === clean.toLowerCase())) merged.push(clean);
  }
  const out: string[] = [];
  for (const t of merged) {
    if (out.length >= (input.limit ?? 15)) break;
    if (tagsLength([...out, t]) > LIMITS.tagsMaxChars) break;
    out.push(t);
  }
  return out;
}

export type CheckStatus = "pass" | "warn" | "fail";
export interface SeoCheck {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  weight: number;
}

export interface SeoInput {
  title: string;
  description: string;
  tags: string[];
  language?: Lang;
  focusKeyword?: string;
  durationSec?: number | null;
}

export interface SeoAnalysis {
  score: number;
  language: Lang;
  focusKeyword: string | null;
  checks: SeoCheck[];
  keywords: Keyword[];
  hashtags: string[];
  suggestedTags: string[];
  intent: { intent: Intent; note: string };
  suggestions: string[];
  method: "heuristic";
}

const has = (hay: string, needle: string): boolean => hay.toLowerCase().includes(needle.toLowerCase());

export function analyzeSeo(input: SeoInput): SeoAnalysis {
  const title = input.title.trim();
  const description = input.description ?? "";
  const language = input.language ?? detectLanguage(`${title} ${description}`);
  const keywords = extractKeywords([title, title, description, input.tags.join(" ")], 10);
  const focus = input.focusKeyword?.trim() || input.tags[0] || keywords[0]?.keyword || null;
  const checks: SeoCheck[] = [];
  const add = (c: SeoCheck) => checks.push(c);

  const tl = title.length;
  add({
    id: "title-length",
    label: "Title length",
    weight: 2,
    status: tl >= 30 && tl <= 70 ? "pass" : tl >= 15 && tl <= 100 ? "warn" : "fail",
    detail: `${tl} characters. About 30–70 reads well in search; long titles get cut off (often near 60 on mobile).`,
  });

  if (focus) {
    const idx = title.toLowerCase().indexOf(focus.toLowerCase());
    add({
      id: "title-keyword",
      label: "Focus keyword in title",
      weight: 3,
      status: idx === -1 ? "fail" : idx > 50 ? "warn" : "pass",
      detail: idx === -1 ? `"${focus}" is not in the title.` : idx > 50 ? `"${focus}" appears late (position ${idx + 1}); move it earlier.` : `"${focus}" appears in the title.`,
    });
  }

  const latinLetters = title.match(LATIN_CHAR) ?? [];
  const upper = title.match(/[A-Z]/g) ?? [];
  add({
    id: "title-caps",
    label: "Title capitalization",
    weight: 1,
    status: latinLetters.length > 8 && upper.length / latinLetters.length > 0.6 ? "warn" : "pass",
    detail: latinLetters.length > 8 && upper.length / latinLetters.length > 0.6 ? "Mostly ALL CAPS can look spammy and is harder to read." : "Capitalization looks fine.",
  });

  const dl = description.trim().length;
  add({
    id: "desc-length",
    label: "Description length",
    weight: 2,
    status: dl >= 250 ? "pass" : dl >= 100 ? "warn" : "fail",
    detail: `${dl} characters. Aim for 250+ with context, keywords used naturally, and links.`,
  });

  if (focus) {
    const first = description.slice(0, 150);
    add({
      id: "desc-keyword",
      label: "Keyword in first 150 characters",
      weight: 2,
      status: has(first, focus) ? "pass" : has(description, focus) ? "warn" : "fail",
      detail: has(first, focus) ? "The first lines (shown before 'more') mention the keyword." : has(description, focus) ? "Keyword is in the description but not in the first lines." : `"${focus}" is missing from the description.`,
    });
  }

  if ((input.durationSec ?? 0) >= 300) {
    const hasChapters = /(^|\n)\s*(\d{1,2}:)?\d{1,2}:\d{2}\s/.test(description);
    add({
      id: "chapters",
      label: "Chapters / timestamps",
      weight: 1,
      status: hasChapters ? "pass" : "warn",
      detail: hasChapters ? "Timestamps found." : "For videos over 5 minutes, chapters (0:00 Intro, ...) help viewers navigate.",
    });
  }

  const hashtagCount = (description.match(/(^|\s)#[\p{L}\p{M}\p{N}_]+/gu) ?? []).length;
  add({
    id: "hashtags",
    label: "Hashtags in description",
    weight: 1,
    status: hashtagCount === 0 ? "warn" : hashtagCount <= 5 ? "pass" : hashtagCount <= 15 ? "warn" : "fail",
    detail:
      hashtagCount === 0 ? "No hashtags. Two or three relevant ones are enough." : hashtagCount > 15 ? "More than 15 hashtags: YouTube ignores all of them." : `${hashtagCount} hashtag(s).`,
  });

  const tagLen = tagsLength(input.tags);
  add({
    id: "tags",
    label: "Tags",
    weight: 1,
    status: tagLen > LIMITS.tagsMaxChars ? "fail" : input.tags.length === 0 ? "warn" : input.tags.length < 5 ? "warn" : "pass",
    detail: `${input.tags.length} tag(s), ${tagLen}/${LIMITS.tagsMaxChars} characters. Tags have a small effect; use them for misspellings and variants.`,
  });

  if (language === "bn") {
    const hasLatin = (title.match(LATIN_CHAR) ?? []).length > 0 || input.tags.some((t) => /[A-Za-z]/.test(t));
    add({
      id: "bilingual",
      label: "Bengali + English reach",
      weight: 1,
      status: hasLatin ? "pass" : "warn",
      detail: hasLatin ? "Includes English terms, which helps people who search in English or Banglish." : "Bengali-only metadata. Adding English keywords as tags/description text can capture mixed-language searches.",
    });
  }

  const totalWeight = checks.reduce((n, c) => n + c.weight, 0);
  const earned = checks.reduce((n, c) => n + c.weight * (c.status === "pass" ? 1 : c.status === "warn" ? 0.5 : 0), 0);
  const score = totalWeight ? Math.round((earned / totalWeight) * 100) : 0;

  return {
    score,
    language,
    focusKeyword: focus,
    checks,
    keywords,
    hashtags: buildHashtags(keywords.map((k) => k.keyword), 3),
    suggestedTags: suggestTags({ title, description, existing: input.tags }),
    intent: classifyIntent(`${title} ${description.slice(0, 300)}`),
    suggestions: checks.filter((c) => c.status !== "pass").map((c) => `${c.label}: ${c.detail}`),
    method: "heuristic",
  };
}

export interface TitleVariant {
  title: string;
  note: string;
}

/** Template-based title drafts to edit. Not AI output and not guaranteed to perform better. */
export function suggestTitleVariants(input: { title: string; keywords: string[]; language: Lang }): TitleVariant[] {
  const core = input.title.trim();
  const kw = input.keywords[0];
  const out: TitleVariant[] = [];
  const push = (t: string, note: string) => {
    const clean = t.replace(/\s+/g, " ").trim();
    if (clean.length >= 10 && clean.length <= LIMITS.titleMax && clean.toLowerCase() !== core.toLowerCase() && !out.some((o) => o.title === clean) && !/[<>]/.test(clean)) {
      out.push({ title: clean, note });
    }
  };
  if (kw && !has(core, kw)) push(`${kw} | ${core}`.slice(0, 70), "Puts the main keyword first.");
  if (input.language === "bn") {
    if (kw) push(`${kw} নিয়ে সম্পূর্ণ গাইড`, "Bengali 'complete guide' pattern (edit to fit your video).");
    push(`${core} | জানুন বিস্তারিত`, "Adds a Bengali call to learn more.");
  } else {
    if (kw) push(`${kw}: ${core}`, "Keyword-first with a colon.");
    push(`${core} (Complete Guide)`, "Signals depth. Use only if it is true for the video.");
    push(`${core} – What You Need to Know`, "Curiosity framing.");
  }
  return out.slice(0, 4);
}

// -------- Competitor summary (pure; the network fetch lives in the service) --------
export interface CompetitorItem {
  title: string;
  channelTitle: string;
  tags: string[];
  views: number | null;
}

export interface CompetitorSummary {
  sampleSize: number;
  commonKeywords: Keyword[];
  commonTags: { tag: string; count: number }[];
  avgTitleLength: number | null;
  patterns: { questionTitles: number; numberTitles: number };
  caveat: string;
}

export function summarizeCompetitors(items: CompetitorItem[]): CompetitorSummary {
  const tagCounts = new Map<string, number>();
  for (const it of items) for (const t of new Set(it.tags.map((x) => x.toLowerCase()))) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
  return {
    sampleSize: items.length,
    commonKeywords: extractKeywords(items.map((i) => i.title), 10),
    commonTags: [...tagCounts.entries()].filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([tag, count]) => ({ tag, count })),
    avgTitleLength: items.length ? Math.round(items.reduce((n, i) => n + i.title.length, 0) / items.length) : null,
    patterns: {
      questionTitles: items.filter((i) => /[?？]|কি\b|কেন|কিভাবে|কীভাবে/i.test(i.title)).length,
      numberTitles: items.filter((i) => /\d/.test(i.title)).length,
    },
    caveat: "Based on a small sample of public search results from the official YouTube API. Tags are only visible when creators expose them. This shows patterns, not what makes a video rank.",
  };
}

export { byteLength };
