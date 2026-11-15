// Pure thumbnail metrics. Operates on raw RGB pixels, so it is testable without any image library.
// HONEST SCOPE: this measures contrast, brightness, colorfulness and edge detail. It does NOT read text
// (no OCR) and cannot know how a thumbnail will perform. Treat output as a design checklist.

export interface RawImage {
  data: Uint8Array | Uint8ClampedArray | Buffer;
  width: number;
  height: number;
  channels: 3 | 4;
}

export interface ThumbnailMetrics {
  meanLuma: number; // 0-255
  contrast: number; // std-dev of luma, 0-128ish
  colorfulness: number; // Hasler-Susstrunk, 0-~150
  saturation: number; // mean HSV saturation 0-1
  edgeDensity: number; // 0-1, share of pixels with strong gradient
  centerEdgeRatio: number; // edge energy in central third / overall (>1 = detail concentrated in center)
  smallEdgeRetention: number; // edge density at mobile size relative to full size (0-1+)
}

function lumaPlane(img: RawImage): Float32Array {
  const { data, width, height, channels } = img;
  const out = new Float32Array(width * height);
  for (let i = 0, p = 0; i < out.length; i++, p += channels) {
    out[i] = 0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2];
  }
  return out;
}

function gradient(luma: Float32Array, w: number, h: number): Float32Array {
  const g = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx = luma[i + 1] - luma[i - 1];
      const gy = luma[i + w] - luma[i - w];
      g[i] = Math.sqrt(gx * gx + gy * gy);
    }
  }
  return g;
}

const EDGE_THRESHOLD = 40;

function edgeStats(g: Float32Array, w: number, h: number): { density: number; centerShare: number } {
  let strong = 0;
  let total = 0;
  let centerStrong = 0;
  let centerPixels = 0;
  const x0 = Math.floor(w / 3);
  const x1 = Math.floor((2 * w) / 3);
  const y0 = Math.floor(h / 3);
  const y1 = Math.floor((2 * h) / 3);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const isStrong = g[y * w + x] > EDGE_THRESHOLD;
      total++;
      if (isStrong) strong++;
      if (x >= x0 && x < x1 && y >= y0 && y < y1) {
        centerPixels++;
        if (isStrong) centerStrong++;
      }
    }
  }
  const density = total ? strong / total : 0;
  const centerDensity = centerPixels ? centerStrong / centerPixels : 0;
  return { density, centerShare: density > 0 ? centerDensity / density : 0 };
}

/** Box-downsample RGB(A) to a smaller size (used to simulate small mobile thumbnails). */
export function downsample(img: RawImage, tw: number, th: number): RawImage {
  const { data, width, height, channels } = img;
  const out = new Uint8Array(tw * th * channels);
  for (let ty = 0; ty < th; ty++) {
    const sy0 = Math.floor((ty * height) / th);
    const sy1 = Math.max(sy0 + 1, Math.floor(((ty + 1) * height) / th));
    for (let tx = 0; tx < tw; tx++) {
      const sx0 = Math.floor((tx * width) / tw);
      const sx1 = Math.max(sx0 + 1, Math.floor(((tx + 1) * width) / tw));
      for (let c = 0; c < channels; c++) {
        let sum = 0;
        let n = 0;
        for (let y = sy0; y < sy1; y++) for (let x = sx0; x < sx1; x++) { sum += data[(y * width + x) * channels + c]; n++; }
        out[(ty * tw + tx) * channels + c] = Math.round(sum / n);
      }
    }
  }
  return { data: out, width: tw, height: th, channels };
}

export function computeMetrics(img: RawImage): ThumbnailMetrics {
  const { data, width, height, channels } = img;
  const n = width * height;
  const luma = lumaPlane(img);

  let sumL = 0;
  for (let i = 0; i < n; i++) sumL += luma[i];
  const meanLuma = sumL / n;
  let varL = 0;
  for (let i = 0; i < n; i++) varL += (luma[i] - meanLuma) ** 2;
  const contrast = Math.sqrt(varL / n);

  // Hasler & Susstrunk colorfulness
  let sumRG = 0, sumYB = 0, sumRG2 = 0, sumYB2 = 0, satSum = 0;
  for (let i = 0, p = 0; i < n; i++, p += channels) {
    const r = data[p], g = data[p + 1], b = data[p + 2];
    const rg = r - g;
    const yb = 0.5 * (r + g) - b;
    sumRG += rg; sumYB += yb; sumRG2 += rg * rg; sumYB2 += yb * yb;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    satSum += mx === 0 ? 0 : (mx - mn) / mx;
  }
  const mRG = sumRG / n, mYB = sumYB / n;
  const sRG = Math.sqrt(Math.max(0, sumRG2 / n - mRG * mRG));
  const sYB = Math.sqrt(Math.max(0, sumYB2 / n - mYB * mYB));
  const colorfulness = Math.sqrt(sRG * sRG + sYB * sYB) + 0.3 * Math.sqrt(mRG * mRG + mYB * mYB);

  const full = edgeStats(gradient(luma, width, height), width, height);

  // Mobile-size simulation: ~168x94 is a typical small feed thumbnail.
  const tw = Math.min(168, width);
  const th = Math.max(1, Math.round((tw * height) / width));
  const small = downsample(img, tw, th);
  const sg = gradient(lumaPlane(small), tw, th);
  const sm = edgeStats(sg, tw, th);

  return {
    meanLuma,
    contrast,
    colorfulness,
    saturation: satSum / n,
    edgeDensity: full.density,
    centerEdgeRatio: full.centerShare,
    smallEdgeRetention: full.density > 0 ? sm.density / full.density : 0,
  };
}

export type Level = "good" | "ok" | "weak";
export interface ThumbnailFinding {
  id: string;
  label: string;
  level: Level;
  value: string;
  advice: string;
}
export interface ThumbnailReport {
  overall: number;
  findings: ThumbnailFinding[];
  metrics: ThumbnailMetrics;
  disclaimer: string;
}

export function scoreThumbnail(m: ThumbnailMetrics): ThumbnailReport {
  const findings: ThumbnailFinding[] = [];
  const add = (f: ThumbnailFinding) => findings.push(f);

  add({
    id: "contrast",
    label: "Contrast",
    level: m.contrast >= 55 ? "good" : m.contrast >= 38 ? "ok" : "weak",
    value: m.contrast.toFixed(0),
    advice: m.contrast >= 55 ? "Strong light/dark separation." : "Low tonal contrast. Darken the background or brighten the subject so shapes and text separate clearly.",
  });
  add({
    id: "brightness",
    label: "Brightness",
    level: m.meanLuma >= 70 && m.meanLuma <= 190 ? "good" : m.meanLuma >= 45 && m.meanLuma <= 215 ? "ok" : "weak",
    value: m.meanLuma.toFixed(0),
    advice: m.meanLuma < 70 ? "Quite dark; may disappear in dark-mode feeds. Add a rim light or lighter accent." : m.meanLuma > 190 ? "Very bright; may look washed out. Add darker areas for depth." : "Brightness is in a comfortable range.",
  });
  add({
    id: "color",
    label: "Color vibrancy",
    level: m.colorfulness >= 45 && m.saturation >= 0.25 ? "good" : m.colorfulness >= 25 ? "ok" : "weak",
    value: m.colorfulness.toFixed(0),
    advice: m.colorfulness >= 45 ? "Colors are vivid enough to catch the eye." : "Fairly muted. A single saturated accent color (against a calmer background) can lift attention.",
  });
  add({
    id: "detail",
    label: "Visual complexity",
    level: m.edgeDensity >= 0.04 && m.edgeDensity <= 0.28 ? "good" : m.edgeDensity < 0.04 || m.edgeDensity > 0.4 ? "weak" : "ok",
    value: `${(m.edgeDensity * 100).toFixed(1)}%`,
    advice: m.edgeDensity < 0.04 ? "Very little detail; may feel empty. Add a clear focal subject or short text." : m.edgeDensity > 0.28 ? "Busy. Reduce clutter so one idea reads instantly." : "Balanced amount of detail.",
  });
  add({
    id: "hierarchy",
    label: "Focal point",
    level: m.centerEdgeRatio >= 1.05 && m.centerEdgeRatio <= 2.2 ? "good" : m.centerEdgeRatio >= 0.8 ? "ok" : "weak",
    value: m.centerEdgeRatio.toFixed(2),
    advice: m.centerEdgeRatio < 0.8 ? "Detail sits mostly at the edges. Move the subject or text toward the center/thirds." : "Detail is reasonably centered around the subject.",
  });
  add({
    id: "mobile",
    label: "Mobile legibility (simulated)",
    level: m.smallEdgeRetention >= 0.55 ? "good" : m.smallEdgeRetention >= 0.3 ? "ok" : "weak",
    value: `${Math.round(m.smallEdgeRetention * 100)}% detail kept at 168px wide`,
    advice: m.smallEdgeRetention >= 0.55 ? "Key shapes survive shrinking." : "Fine detail disappears at small size. Use fewer, bigger elements and 3–4 word text at large size.",
  });

  const pts = findings.reduce((n, f) => n + (f.level === "good" ? 1 : f.level === "ok" ? 0.6 : 0.2), 0);
  return {
    overall: Math.round((pts / findings.length) * 100),
    findings,
    metrics: m,
    disclaimer:
      "Automated pixel analysis only. It cannot read the text in your image or predict click-through rate. Use YouTube Studio's 'Test & compare' with real impressions to measure CTR.",
  };
}

export interface ThumbnailConcept {
  name: string;
  layout: string;
  overlayText: string;
  palette: string[];
  imagePrompt: string;
}

/** Deterministic concept starters + image-generation prompts. Edit freely; they are ideas, not predictions. */
export function thumbnailConcepts(input: { title: string; keywords: string[]; language: "bn" | "en" | "mixed" }): ThumbnailConcept[] {
  const topic = input.keywords[0] ?? input.title;
  const short = input.title.split(/[|:–—-]/)[0].trim().split(/\s+/).slice(0, 4).join(" ");
  const bn = input.language === "bn";
  const textHint = bn ? "Large bold Bengali text (use a heavy Bengali font such as Noto Sans Bengali Bold)" : "Large bold sans-serif text";
  return [
    {
      name: "Single focal subject",
      layout: "Subject on the right third, 3–4 word headline on the left, solid contrasting background.",
      overlayText: short,
      palette: ["#111827", "#FACC15", "#FFFFFF"],
      imagePrompt: `YouTube thumbnail, 16:9, close-up of ${topic} as the single focal subject on the right, clean dark background with a soft rim light, high contrast, shallow depth of field, empty space on the left for text. ${textHint} reading "${short}". No watermarks, no logos.`,
    },
    {
      name: "Before / after split",
      layout: "Vertical split: muted 'before' left, vibrant 'after' right, arrow or divider in the middle.",
      overlayText: bn ? "আগে vs পরে" : "Before vs After",
      palette: ["#374151", "#22C55E", "#F9FAFB"],
      imagePrompt: `YouTube thumbnail, 16:9, split-screen comparison about ${topic}: left side desaturated and dull, right side vibrant and polished, bold divider line. ${textHint}. High contrast, uncluttered.`,
    },
    {
      name: "Curiosity close-up",
      layout: "Extreme close-up with one highlighted detail (circle or arrow) and a two-word question.",
      overlayText: bn ? "কেন?" : "Why?",
      palette: ["#0F172A", "#F97316", "#E2E8F0"],
      imagePrompt: `YouTube thumbnail, 16:9, dramatic extreme close-up related to ${topic}, one detail highlighted with a bright orange circle, cinematic lighting, strong vignette. ${textHint} showing a short question. Readable at small size.`,
    },
  ];
}
