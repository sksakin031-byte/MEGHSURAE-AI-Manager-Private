import { describe, expect, it, beforeEach } from "vitest";
import { validateDescription, validateTags, validateTitle } from "@/lib/youtube-limits";
import { dateRanges, pctChange } from "@/lib/dates";
import { rateLimit, resetRateLimits } from "@/lib/rate-limit";

describe("YouTube field limits", () => {
  it("validates titles", () => {
    expect(validateTitle("Good title")).toBeNull();
    expect(validateTitle("   ")).toMatch(/empty/);
    expect(validateTitle("a".repeat(101))).toMatch(/limit/);
    expect(validateTitle("bad <b>")).toMatch(/</);
  });
  it("counts description bytes, not characters (Bengali = 3 bytes)", () => {
    expect(validateDescription("a".repeat(5000))).toBeNull();
    expect(validateDescription("অ".repeat(1700))).toMatch(/bytes/);
  });
  it("validates tags", () => {
    expect(validateTags(["a", "b"])).toBeNull();
    expect(validateTags([""])).toMatch(/empty/);
    expect(validateTags(Array.from({ length: 80 }, (_, i) => `tag-number-${i}`))).toMatch(/limit/);
  });
});

describe("date ranges and change %", () => {
  it("builds adjacent equal-length windows", () => {
    const r = dateRanges(7, new Date("2026-03-15T10:00:00Z"));
    expect(r.current).toEqual({ start: "2026-03-08", end: "2026-03-14" });
    expect(r.previous).toEqual({ start: "2026-03-01", end: "2026-03-07" });
  });
  it("does not invent percentages", () => {
    expect(pctChange(150, 100)).toBe(50);
    expect(pctChange(5, 0)).toBeNull();
    expect(pctChange(0, 0)).toBe(0);
    expect(pctChange(null, 10)).toBeNull();
    expect(pctChange(10, null)).toBeNull();
  });
});

describe("rate limiter", () => {
  beforeEach(() => resetRateLimits());
  it("blocks after the limit and recovers after the window", () => {
    for (let i = 0; i < 3; i++) expect(rateLimit("k", 3, 1000, 1000 + i).ok).toBe(true);
    expect(rateLimit("k", 3, 1000, 1003).ok).toBe(false);
    expect(rateLimit("k", 3, 1000, 2500).ok).toBe(true);
    expect(rateLimit("other", 3, 1000, 1003).ok).toBe(true);
  });
});
