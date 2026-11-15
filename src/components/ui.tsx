import type { ReactNode } from "react";
import { Loader2, AlertTriangle, Info } from "lucide-react";
import { fmtDateTime } from "@/lib/format";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`card ${className}`}>{children}</section>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-6 text-sm text-muted" role="status">
      <Loader2 className="h-4 w-4 animate-spin" /> {label}
    </div>
  );
}

export function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div className="flex items-start gap-2 rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger" role="alert">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> <span className="break-words">{error}</span>
    </div>
  );
}

export function InfoNote({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-line bg-bg p-3 text-xs text-muted">
      <Info className="mt-0.5 h-4 w-4 shrink-0" /> <span>{children}</span>
    </div>
  );
}

type Tone = "ok" | "warn" | "danger" | "brand" | "muted";
const TONES: Record<Tone, string> = {
  ok: "border-ok/40 bg-ok/10 text-ok",
  warn: "border-warn/40 bg-warn/10 text-warn",
  danger: "border-danger/40 bg-danger/10 text-danger",
  brand: "border-brand/40 bg-brand/10 text-brand",
  muted: "border-line text-muted",
};

export function Badge({ tone = "muted", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${TONES[tone]}`}>{children}</span>;
}

export function SourceNote({ source, fetchedAt }: { source?: string; fetchedAt?: string }) {
  if (!source && !fetchedAt) return null;
  return (
    <p className="mt-3 text-xs text-muted">
      Source: {source ?? "YouTube API"}
      {fetchedAt ? ` · retrieved ${fmtDateTime(fetchedAt)}` : ""}
    </p>
  );
}

export function ScoreBar({ score }: { score: number }) {
  const tone = score >= 75 ? "bg-ok" : score >= 50 ? "bg-warn" : "bg-danger";
  return (
    <div className="flex items-center gap-3">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-line" aria-hidden>
        <div className={`h-full ${tone}`} style={{ width: `${Math.max(0, Math.min(100, score))}%` }} />
      </div>
      <span className="w-10 text-right text-sm font-semibold tabular-nums">{Math.round(score)}</span>
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="card !p-3">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </div>
  );
}

export function statusTone(status: string): Tone {
  switch (status) {
    case "pass":
    case "good":
    case "ok":
    case "EXECUTED":
      return "ok";
    case "warn":
    case "PENDING":
    case "EXECUTING":
    case "medium":
      return "warn";
    case "fail":
    case "weak":
    case "FAILED":
    case "high":
      return "danger";
    default:
      return "muted";
  }
}
