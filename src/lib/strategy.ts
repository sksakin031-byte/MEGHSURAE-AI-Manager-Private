// Pure content-strategy engine: derives patterns from the channel's OWN video data. No invented stats.
import type { Video } from "../types";
import { extractKeywords, detectLanguage, type Lang } from "./seo";

export interface VideoPerf {
  id: string;
  title: string;
  publishedAt: string;
  ageDays: number;
  views: number;
  viewsPerDay: number;
}

const DAY = 86_400_000;

/** Ranks videos by views per day since publish (videos under 3 days old are excluded: too early to judge). */
export function rankPerformance(videos: Video[], now: Date = new Date()): VideoPerf[] {
  const out: VideoPerf[] = [];
  for (const v of videos) {
    if (!v.publishedAt || v.views === null || v.privacy !== "public") continue;
    const ageDays = (now.getTime() - Date.parse(v.publishedAt)) / DAY;
    if (!(ageDays >= 3)) continue;
    out.push({ id: v.id, title: v.title, publishedAt: v.publishedAt, ageDays: Math.floor(ageDays), views: v.views, viewsPerDay: v.views / ageDays });
  }
  return out.sort((a, b) => b.viewsPerDay - a.viewsPerDay);
}

export interface Idea {
  title: string;
  why: string;
  angle: string;
}

export interface PlanSlot {
  date: string;
  weekday: string;
  type: "upload" | "review" | "maintenance";
  task: string;
}

export interface Strategy {
  horizon: "weekly" | "monthly";
  uploadsPerWeek: number;
  basis: { videosConsidered: number; topPerformers: VideoPerf[]; workingKeywords: string[] };
  ideas: Idea[];
  plan: PlanSlot[];
  checklist: string[];
  caveats: string[];
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function uploadOffsets(perWeek: number): number[] {
  const n = Math.min(7, Math.max(1, Math.round(perWeek)));
  return [...new Set(Array.from({ length: n }, (_, i) => Math.floor((i * 7) / n)))];
}

function angles(kw: string, lang: Lang): { title: string; angle: string }[] {
  if (lang === "bn") {
    return [
      { title: `${kw} নিয়ে সম্পূর্ণ গাইড`, angle: "Complete guide" },
      { title: `${kw} নিয়ে সাধারণ ভুল`, angle: "Common mistakes" },
      { title: `${kw}: প্রশ্ন ও উত্তর`, angle: "Q&A" },
    ];
  }
  return [
    { title: `${kw}: a beginner's guide`, angle: "Beginner guide" },
    { title: `${kw} mistakes to avoid`, angle: "Common mistakes" },
    { title: `${kw} explained: your questions answered`, angle: "Q&A" },
  ];
}

export function buildStrategy(input: {
  videos: Video[];
  now?: Date;
  uploadsPerWeek: number;
  horizon: "weekly" | "monthly";
  language?: Lang;
}): Strategy {
  const now = input.now ?? new Date();
  const ranked = rankPerformance(input.videos, now);
  const topN = Math.max(1, Math.ceil(ranked.length / 4));
  const top = ranked.slice(0, Math.min(5, ranked.length));
  const topQuartile = ranked.slice(0, topN);
  const sample = topQuartile.length ? topQuartile.map((v) => v.title) : input.videos.slice(0, 10).map((v) => v.title);
  const language = input.language ?? detectLanguage(sample.join(" "));
  const working = extractKeywords(sample, 5).map((k) => k.keyword);

  const ideas: Idea[] = [];
  for (const kw of working) {
    const appears = topQuartile.filter((v) => v.title.toLowerCase().includes(kw)).length;
    for (const a of angles(kw, language)) {
      ideas.push({
        title: a.title,
        angle: a.angle,
        why: appears
          ? `"${kw}" appears in ${appears} of your ${topQuartile.length} fastest-growing videos (views per day since publish).`
          : `"${kw}" is a recurring topic in your recent uploads.`,
      });
    }
  }
  if (!ideas.length) {
    ideas.push({ title: "Introduce your channel: who it is for and what you will cover", angle: "Channel intro", why: "Not enough video history to find patterns yet." });
  }

  const days = input.horizon === "weekly" ? 7 : 30;
  const offsets = new Set(uploadOffsets(input.uploadsPerWeek));
  const plan: PlanSlot[] = [];
  let ideaIdx = 0;
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  for (let d = 0; d < days; d++) {
    const date = new Date(start.getTime() + d * DAY);
    const dow = date.getUTCDay();
    const slot = { date: date.toISOString().slice(0, 10), weekday: WEEKDAYS[dow] };
    if (offsets.has(d % 7)) {
      const idea = ideas[ideaIdx % ideas.length];
      ideaIdx++;
      plan.push({ ...slot, type: "upload", task: `Publish: ${idea.title}` });
    } else if (dow === 0) {
      plan.push({ ...slot, type: "review", task: "Review last week's views, watch time, CTR and retention in YouTube Studio; note what to repeat." });
    } else if (dow === 3) {
      plan.push({ ...slot, type: "maintenance", task: "Improve one older video: title, first lines of description, chapters, end-screen." });
    }
  }

  return {
    horizon: input.horizon,
    uploadsPerWeek: Math.min(7, Math.max(1, Math.round(input.uploadsPerWeek))),
    basis: { videosConsidered: ranked.length, topPerformers: top, workingKeywords: working },
    ideas: ideas.slice(0, 12),
    plan,
    checklist: [
      "Write the title and thumbnail text before filming so the idea is clear in one glance.",
      "Put the main keyword in the title and in the first 150 characters of the description.",
      "Add chapters to videos longer than 5 minutes.",
      "Add the video to a relevant playlist at publish time.",
      "After 7 days, compare CTR and average view duration against your previous 5 uploads.",
    ],
    caveats: [
      "Ideas are templates built from your own title keywords. They are starting points, not predictions of success.",
      ranked.length < 8 ? "Fewer than 8 eligible videos: patterns are weak. Treat this plan as a rough draft." : "Based on views per day since publish; it ignores promotion, seasonality and traffic source.",
    ],
  };
}
