import { describe, expect, it } from "vitest";
import { auditChannel } from "@/lib/channel-audit";
import { buildStrategy } from "@/lib/strategy";
import { suggestPlaylists } from "@/lib/playlist-suggest";
import type { Channel, Video } from "@/types";

const NOW = new Date("2026-06-01T00:00:00Z");

function video(i: number, title: string, daysAgo: number, views: number | null): Video {
  return {
    id: `vid${String(i).padStart(8, "0")}`,
    title,
    description: "short",
    tags: [],
    publishedAt: new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString(),
    thumbnailUrl: null,
    durationSec: 300,
    views,
    likes: null,
    comments: null,
    privacy: "public",
    categoryId: "22",
    defaultLanguage: null,
  };
}

const channel: Channel = {
  id: "UC123456789",
  title: "T",
  description: "tiny",
  customUrl: null,
  publishedAt: null,
  country: null,
  avatarUrl: null,
  bannerUrl: null,
  keywords: [],
  trailerVideoId: null,
  uploadsPlaylistId: "UU1",
  stats: { views: 100, subscribers: 10, subscribersHidden: false, videos: 5 },
  fetchedAt: NOW.toISOString(),
  source: "test",
};

const videos = [
  video(1, "Python tutorial part 1", 100, 5000),
  video(2, "Python tutorial part 2", 60, 3000),
  video(3, "Python tutorial part 3", 30, 2000),
  video(4, "Travel vlog Dhaka", 20, 400),
  video(5, "Cooking biryani at home", 10, null),
];

describe("channel audit", () => {
  it("flags missing basics as to-do and keeps priorities valid", () => {
    const a = auditChannel({ channel, videos, playlists: [], sections: [], now: NOW });
    expect(a.items.find((i) => i.id === "channel-description")?.status).toBe("todo");
    expect(a.items.find((i) => i.id === "banner")?.status).toBe("todo");
    for (const i of a.items) expect(["high", "medium", "low"]).toContain(i.priority);
    expect(a.summary.todo).toBe(a.items.filter((i) => i.status === "todo").length);
  });
  it("handles unknown homepage sections (null) without inventing a verdict", () => {
    const a = auditChannel({ channel, videos, playlists: [], sections: null, now: NOW });
    expect(a.items.some((i) => i.id === "sections")).toBe(false);
    expect(a.basedOn.sections).toBeNull();
  });
});

describe("strategy", () => {
  it("is based on real videos and ignores videos without view data", () => {
    const s = buildStrategy({ videos, uploadsPerWeek: 2, horizon: "weekly", now: NOW });
    expect(s.basis.topPerformers[0].title).toMatch(/Python/);
    expect(s.basis.topPerformers.some((v) => v.title.includes("biryani"))).toBe(false);
    expect(s.plan.filter((p) => p.type === "upload")).toHaveLength(2);
    expect(s.caveats.length).toBeGreaterThan(0);
  });
  it("monthly plans cover roughly four weeks of uploads", () => {
    const s = buildStrategy({ videos, uploadsPerWeek: 3, horizon: "monthly", now: NOW });
    expect(s.plan.filter((p) => p.type === "upload").length).toBeGreaterThanOrEqual(9);
  });
  it("works with no videos", () => {
    const s = buildStrategy({ videos: [], uploadsPerWeek: 1, horizon: "weekly", now: NOW });
    expect(s.basis.videosConsidered).toBe(0);
  });
});

describe("playlist suggestions", () => {
  it("groups videos sharing a keyword", () => {
    const sug = suggestPlaylists(videos, []);
    expect(sug.some((s) => s.keyword.includes("python") && s.videoIds.length >= 3)).toBe(true);
  });
  it("does not re-suggest a topic that already has a playlist", () => {
    const existing = [{ id: "PL1", title: "Python tutorial", description: "", itemCount: 3, privacy: "public", publishedAt: null, thumbnailUrl: null }];
    expect(suggestPlaylists(videos, existing).some((s) => s.keyword.includes("python"))).toBe(false);
  });
});
