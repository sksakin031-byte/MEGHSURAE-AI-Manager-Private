import type { PermissionMode } from "@/lib/permissions";

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
  channelId: string | null;
  channelTitle: string | null;
  permissionMode: PermissionMode;
  grantedScopes: string[];
  /** True when the Google grant includes the YouTube write scope. */
  canEditYouTube: boolean;
}

export interface Channel {
  id: string;
  title: string;
  description: string;
  customUrl: string | null;
  publishedAt: string | null;
  country: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  keywords: string[];
  trailerVideoId: string | null;
  uploadsPlaylistId: string | null;
  stats: {
    views: number | null;
    subscribers: number | null;
    subscribersHidden: boolean;
    videos: number | null;
  };
  fetchedAt: string;
  source: string;
}

export interface Video {
  id: string;
  title: string;
  description: string;
  tags: string[];
  publishedAt: string | null;
  thumbnailUrl: string | null;
  durationSec: number | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  privacy: string;
  categoryId: string | null;
  defaultLanguage: string | null;
}

export interface Playlist {
  id: string;
  title: string;
  description: string;
  itemCount: number;
  privacy: string;
  publishedAt: string | null;
  thumbnailUrl: string | null;
}

export interface ChannelSection {
  id: string;
  type: string;
  title: string | null;
}

/** Honest metric: unavailable is NOT the same as zero. */
export type Metric = { available: true; value: number } | { available: false; reason: string };

export interface MetricPair {
  current: Metric;
  previous: Metric;
  changePct: number | null;
}

export interface AnalyticsOverview {
  period: { start: string; end: string };
  previousPeriod: { start: string; end: string };
  metrics: Record<
    | "views"
    | "watchTimeMinutes"
    | "avgViewDurationSec"
    | "subscribersNet"
    | "likes"
    | "comments"
    | "impressions"
    | "ctrPercent",
    MetricPair
  >;
  daily: { date: string; views: number; watchTimeMinutes: number }[] | null;
  dailyReason?: string;
  topVideos: { videoId: string; views: number; watchTimeMinutes: number; avgViewDurationSec: number }[] | null;
  topVideosReason?: string;
  fetchedAt: string;
  source: string;
  notes: string[];
}

export type ChangeKind = "video_metadata" | "playlist_create" | "playlist_update" | "playlist_add_video";
export type ChangeStatus = "PENDING" | "EXECUTING" | "EXECUTED" | "REJECTED" | "FAILED" | "UNCERTAIN";

export interface ChangeRecord {
  id: string;
  kind: ChangeKind;
  targetId: string | null;
  summary: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown>;
  status: ChangeStatus;
  source: "ui" | "mcp";
  createdAt: string;
  decidedAt: string | null;
  executedAt: string | null;
  error: string | null;
}
