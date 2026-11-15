import { dateRanges, pctChange } from "@/lib/dates";
import { getAccessToken } from "@/services/tokens";
import type { AnalyticsOverview, Metric, MetricPair } from "@/types";

const REPORTS = "https://youtubeanalytics.googleapis.com/v2/reports";

interface Report {
  columnHeaders?: { name: string }[];
  rows?: (string | number)[][];
}

class ReportError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function report(userId: string, params: Record<string, string>): Promise<Report> {
  const token = await getAccessToken(userId);
  const res = await fetch(`${REPORTS}?${new URLSearchParams({ ids: "channel==MINE", ...params })}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new ReportError(res.status, body.error?.message ?? `HTTP ${res.status}`);
  }
  return (await res.json()) as Report;
}

function unavailable(reason: string): Metric {
  return { available: false, reason };
}

/** Reads a single-row, no-dimension report into named metrics. Empty result => unavailable, never 0. */
function rowToMetrics(r: Report, names: string[]): Record<string, Metric> {
  const out: Record<string, Metric> = {};
  const row = r.rows?.[0];
  const headers = (r.columnHeaders ?? []).map((h) => h.name);
  for (const n of names) {
    const i = headers.indexOf(n);
    if (!row || i < 0 || row[i] === null || row[i] === undefined) out[n] = unavailable("No data returned by YouTube for this period.");
    else out[n] = { available: true, value: Number(row[i]) };
  }
  return out;
}

async function groupMetrics(userId: string, start: string, end: string, names: string[]): Promise<Record<string, Metric>> {
  try {
    return rowToMetrics(await report(userId, { startDate: start, endDate: end, metrics: names.join(",") }), names);
  } catch (e) {
    const reason =
      e instanceof ReportError && (e.status === 403 || e.status === 401)
        ? "Not permitted (analytics scope missing or channel not eligible)."
        : e instanceof ReportError
          ? `YouTube Analytics could not provide this metric: ${e.message}`
          : "Request failed.";
    return Object.fromEntries(names.map((n) => [n, unavailable(reason)]));
  }
}

function pair(cur: Metric, prev: Metric): MetricPair {
  return {
    current: cur,
    previous: prev,
    changePct: cur.available && prev.available ? pctChange(cur.value, prev.value) : null,
  };
}

export async function getAnalyticsOverview(userId: string, days: number, now = new Date()): Promise<AnalyticsOverview> {
  const { current, previous } = dateRanges(days, now, 1);
  const core = ["views", "estimatedMinutesWatched", "averageViewDuration", "subscribersGained", "subscribersLost", "likes", "comments"];
  // Impressions / CTR are requested separately: if YouTube rejects them, the rest still works.
  const thumbs = ["videoThumbnailImpressions", "videoThumbnailImpressionsClickRate"];

  const [c, p, ct, pt] = await Promise.all([
    groupMetrics(userId, current.start, current.end, core),
    groupMetrics(userId, previous.start, previous.end, core),
    groupMetrics(userId, current.start, current.end, thumbs),
    groupMetrics(userId, previous.start, previous.end, thumbs),
  ]);

  const net = (m: Record<string, Metric>): Metric => {
    const g = m.subscribersGained;
    const l = m.subscribersLost;
    return g.available && l.available ? { available: true, value: g.value - l.value } : unavailable("Subscriber change not available.");
  };

  let daily: AnalyticsOverview["daily"] = null;
  let dailyReason: string | undefined;
  try {
    const r = await report(userId, {
      startDate: current.start,
      endDate: current.end,
      metrics: "views,estimatedMinutesWatched",
      dimensions: "day",
      sort: "day",
    });
    daily = (r.rows ?? []).map((row) => ({ date: String(row[0]), views: Number(row[1]), watchTimeMinutes: Number(row[2]) }));
    if (!daily.length) {
      daily = null;
      dailyReason = "No daily rows returned for this period.";
    }
  } catch (e) {
    dailyReason = e instanceof Error ? e.message : "Daily report failed.";
  }

  let topVideos: AnalyticsOverview["topVideos"] = null;
  let topVideosReason: string | undefined;
  try {
    const r = await report(userId, {
      startDate: current.start,
      endDate: current.end,
      metrics: "views,estimatedMinutesWatched,averageViewDuration",
      dimensions: "video",
      sort: "-views",
      maxResults: "10",
    });
    topVideos = (r.rows ?? []).map((row) => ({
      videoId: String(row[0]),
      views: Number(row[1]),
      watchTimeMinutes: Number(row[2]),
      avgViewDurationSec: Number(row[3]),
    }));
    if (!topVideos.length) {
      topVideos = null;
      topVideosReason = "No per-video rows returned for this period.";
    }
  } catch (e) {
    topVideosReason = e instanceof Error ? e.message : "Top videos report failed.";
  }

  const ctrToPercent = (m: Metric): Metric => (m.available ? { available: true, value: m.value > 1 ? m.value : m.value * 100 } : m);
  // The API reports the click rate as a fraction or percentage depending on version; normalize to percent.
  const ctrCur = ctrToPercent(ct.videoThumbnailImpressionsClickRate);
  const ctrPrev = ctrToPercent(pt.videoThumbnailImpressionsClickRate);

  return {
    period: current,
    previousPeriod: previous,
    metrics: {
      views: pair(c.views, p.views),
      watchTimeMinutes: pair(c.estimatedMinutesWatched, p.estimatedMinutesWatched),
      avgViewDurationSec: pair(c.averageViewDuration, p.averageViewDuration),
      subscribersNet: pair(net(c), net(p)),
      likes: pair(c.likes, p.likes),
      comments: pair(c.comments, p.comments),
      impressions: pair(ct.videoThumbnailImpressions, pt.videoThumbnailImpressions),
      ctrPercent: pair(ctrCur, ctrPrev),
    },
    daily,
    dailyReason,
    topVideos,
    topVideosReason,
    fetchedAt: new Date().toISOString(),
    source: "YouTube Analytics API v2 · reports.query",
    notes: [
      "YouTube Analytics data can lag by a day or more, and the most recent days may be revised.",
      "A metric shown as 'unavailable' means YouTube did not return it. It does not mean the value is zero.",
      "Day boundaries follow YouTube's reporting time zone (Pacific Time).",
    ],
  };
}
