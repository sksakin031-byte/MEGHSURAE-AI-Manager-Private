import sharp from "sharp";
import { AppError, badRequest } from "@/lib/errors";
import { computeMetrics, scoreThumbnail, type ThumbnailReport } from "@/lib/thumbnail-metrics";

const ALLOWED_HOSTS = [/^i\d*\.ytimg\.com$/, /^img\.youtube\.com$/, /^yt3\.ggpht\.com$/, /^yt3\.googleusercontent\.com$/];
const MAX_BYTES = 5 * 1024 * 1024;

/** SSRF guard: only fetch images from YouTube's own image CDNs over HTTPS. */
export function assertThumbnailUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw badRequest("Invalid thumbnail URL.");
  }
  if (u.protocol !== "https:" || u.username || u.password || u.port || !ALLOWED_HOSTS.some((r) => r.test(u.hostname))) {
    throw badRequest("Thumbnail URL host is not allowed.");
  }
  return u;
}

export async function analyzeThumbnailUrl(rawUrl: string): Promise<ThumbnailReport & { width: number; height: number }> {
  const url = assertThumbnailUrl(rawUrl);
  const res = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new AppError(502, "thumbnail_fetch_failed", `Could not download thumbnail (${res.status}).`);
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > MAX_BYTES) throw new AppError(413, "too_large", "Thumbnail is too large to analyze.");
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_BYTES) throw new AppError(413, "too_large", "Thumbnail is too large to analyze.");

  const meta = await sharp(buf).metadata();
  const { data, info } = await sharp(buf)
    .resize(640, 360, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const report = scoreThumbnail(computeMetrics({ data, width: info.width, height: info.height, channels: 3 }));
  return { ...report, width: meta.width ?? info.width, height: meta.height ?? info.height };
}
