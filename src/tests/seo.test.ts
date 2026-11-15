import { describe, expect, it } from "vitest";
import { analyzeSeo, buildHashtags, classifyIntent, detectLanguage, extractKeywords, suggestTitleVariants, summarizeCompetitors, tokenize } from "@/lib/seo";

describe("language and tokens", () => {
  it("detects Bengali, English and mixed text", () => {
    expect(detectLanguage("কিভাবে ভাত রান্না করবেন")).toBe("bn");
    expect(detectLanguage("How to cook rice")).toBe("en");
    expect(detectLanguage("Easy রান্না recipe দেখুন quickly")).toBe("mixed");
  });
  it("keeps Bengali combining marks inside words", () => {
    expect(tokenize("রান্নার রেসিপি")).toContain("রান্নার");
  });
});

describe("keywords and intent", () => {
  it("extracts repeated phrases", () => {
    const kws = extractKeywords(["Python tutorial for beginners", "Python tutorial advanced", "python tutorial tips"], 5).map((k) => k.keyword);
    expect(kws.join(" ")).toMatch(/python/);
  });
  it("classifies intent in English and Bengali", () => {
    expect(classifyIntent("How to learn guitar").intent).toBe("how-to");
    expect(classifyIntent("কিভাবে ছবি আঁকবেন").intent).toBe("how-to");
    expect(classifyIntent("iPhone vs Samsung").intent).toBe("comparison");
    expect(classifyIntent("my morning").intent).toBe("general");
  });
  it("builds hashtags without spaces", () => {
    for (const h of buildHashtags(["python tutorial", "বাংলা গান"], 3)) expect(h).toMatch(/^#\S+$/);
  });
});

describe("analyzeSeo", () => {
  it("scores a well-formed video higher than a bare one", () => {
    const good = analyzeSeo({
      title: "Python tutorial for beginners: build your first app",
      description: "In this Python tutorial for beginners you will build your first app step by step. ".repeat(6) + "\n0:00 Intro\n1:20 Setup\n#python #tutorial",
      tags: ["python", "python tutorial", "beginners", "programming"],
    });
    const bad = analyzeSeo({ title: "vid1", description: "", tags: [] });
    expect(good.score).toBeGreaterThan(bad.score);
    expect(bad.checks.some((c) => c.status === "fail")).toBe(true);
    expect(good.method).toBe("heuristic");
    expect(good.score).toBeGreaterThanOrEqual(0);
    expect(good.score).toBeLessThanOrEqual(100);
  });
  it("works for Bengali titles", () => {
    const r = analyzeSeo({ title: "কিভাবে ঘরে বসে বিরিয়ানি রান্না করবেন", description: "", tags: [] });
    expect(r.language).toBe("bn");
  });
  it("title variants never exceed YouTube's 100-char limit", () => {
    const vs = suggestTitleVariants({ title: "A".repeat(90), keywords: ["keyword phrase"], language: "en" });
    for (const v of vs) expect([...v.title].length).toBeLessThanOrEqual(100);
  });
});

describe("competitor summary", () => {
  it("handles empty input without NaN", () => {
    const s = summarizeCompetitors([]);
    expect(s.sampleSize).toBe(0);
    expect(s.avgTitleLength).toBeNull();
  });
  it("counts patterns", () => {
    const s = summarizeCompetitors([
      { title: "Why is the sky blue?", channelTitle: "A", tags: ["sky", "science"], views: 10 },
      { title: "5 science facts", channelTitle: "B", tags: ["science"], views: null },
    ]);
    expect(s.patterns.questionTitles).toBe(1);
    expect(s.patterns.numberTitles).toBe(1);
    expect(s.commonTags[0]).toEqual({ tag: "science", count: 2 });
  });
});
