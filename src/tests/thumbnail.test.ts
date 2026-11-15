import { describe, expect, it } from "vitest";
import { computeMetrics, downsample, scoreThumbnail, thumbnailConcepts, type RawImage } from "@/lib/thumbnail-metrics";

function solid(r: number, g: number, b: number, w = 160, h = 90): RawImage {
  const data = new Uint8Array(w * h * 3);
  for (let i = 0; i < w * h; i++) data.set([r, g, b], i * 3);
  return { data, width: w, height: h, channels: 3 };
}

function checker(w = 160, h = 90, cell = 10): RawImage {
  const data = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = (Math.floor(x / cell) + Math.floor(y / cell)) % 2 ? 255 : 0;
      data.set([v, v, v], (y * w + x) * 3);
    }
  return { data, width: w, height: h, channels: 3 };
}

describe("thumbnail metrics", () => {
  it("flat grey image has no contrast or edges", () => {
    const m = computeMetrics(solid(128, 128, 128));
    expect(m.contrast).toBeLessThan(1);
    expect(m.edgeDensity).toBe(0);
    expect(m.saturation).toBeLessThan(0.01);
  });
  it("high-contrast pattern scores more contrast and detail than a flat image", () => {
    const flat = computeMetrics(solid(120, 120, 120));
    const busy = computeMetrics(checker());
    expect(busy.contrast).toBeGreaterThan(flat.contrast + 50);
    expect(busy.edgeDensity).toBeGreaterThan(flat.edgeDensity);
  });
  it("scores stay in range and flat images are flagged weak somewhere", () => {
    const r = scoreThumbnail(computeMetrics(solid(120, 120, 120)));
    expect(r.overall).toBeGreaterThanOrEqual(0);
    expect(r.overall).toBeLessThanOrEqual(100);
    expect(r.findings.some((f) => f.level === "weak")).toBe(true);
    expect(r.disclaimer.length).toBeGreaterThan(10);
  });
  it("downsample keeps dimensions", () => {
    const d = downsample(checker(), 48, 27);
    expect(d.width).toBe(48);
    expect(d.height).toBe(27);
  });
  it("produces concepts with prompts", () => {
    const c = thumbnailConcepts({ title: "Easy biryani recipe", keywords: ["biryani"], language: "en" });
    expect(c.length).toBeGreaterThanOrEqual(2);
    for (const x of c) {
      expect(x.imagePrompt.length).toBeGreaterThan(20);
      expect(x.palette.length).toBeGreaterThan(0);
    }
  });
});
