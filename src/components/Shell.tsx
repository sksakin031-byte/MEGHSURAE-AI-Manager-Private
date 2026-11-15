"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BarChart3, Bot, ClipboardCheck, Film, History, Home, ImageIcon, ListVideo, MoreHorizontal, Search, Settings, Sparkles, X } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Badge } from "@/components/ui";
import { useMe } from "@/hooks/useApi";

const NAV = [
  { href: "/", label: "Overview", icon: Home, primary: true },
  { href: "/videos", label: "Videos", icon: Film, primary: true },
  { href: "/seo", label: "SEO", icon: Search, primary: true },
  { href: "/analytics", label: "Analytics", icon: BarChart3, primary: true },
  { href: "/thumbnails", label: "Thumbnails", icon: ImageIcon },
  { href: "/playlists", label: "Playlists", icon: ListVideo },
  { href: "/optimize", label: "Channel audit", icon: ClipboardCheck },
  { href: "/strategy", label: "Strategy", icon: Sparkles },
  { href: "/assistant", label: "Assistant", icon: Bot },
  { href: "/changes", label: "Changes & log", icon: History },
  { href: "/settings", label: "Settings", icon: Settings },
];

function active(path: string, href: string) {
  return href === "/" ? path === "/" : path === href || path.startsWith(href + "/");
}

function ModeBadge() {
  const { data } = useMe();
  const m = data?.user.permissionMode;
  if (!m) return null;
  return (
    <Link href="/settings" aria-label={`Permission mode: ${m}. Open settings`}>
      <Badge tone={m === "READ" ? "ok" : m === "APPROVAL" ? "warn" : "danger"}>{data.modeInfo[m].label} mode</Badge>
    </Link>
  );
}

export function Shell({ children, channelTitle }: { children: React.ReactNode; channelTitle: string | null }) {
  const path = usePathname();
  const [more, setMore] = useState(false);
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[240px_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col gap-1 overflow-y-auto border-r border-line bg-card p-4 md:flex">
        <div className="mb-4 px-2">
          <div className="text-lg font-bold tracking-tight text-brand">MEGHSURAE</div>
          <div className="text-xs text-muted">AI Manager{channelTitle ? ` · ${channelTitle}` : ""}</div>
        </div>
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={active(path, href) ? "page" : undefined}
            className={`flex min-h-[44px] items-center gap-3 rounded-xl px-3 text-sm ${active(path, href) ? "bg-brand/10 font-semibold text-brand" : "text-muted hover:bg-bg hover:text-fg"}`}
          >
            <Icon className="h-4 w-4" /> {label}
          </Link>
        ))}
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-line bg-bg/90 px-4 py-2 backdrop-blur">
          <span className="font-bold text-brand md:hidden">MEGHSURAE</span>
          <span className="hidden text-sm text-muted md:inline">{channelTitle ?? "Your channel"}</span>
          <div className="flex items-center gap-2">
            <ModeBadge />
            <ThemeToggle />
          </div>
        </header>
        <main className="mx-auto w-full max-w-5xl px-4 pb-28 pt-4 md:pb-10">{children}</main>
      </div>

      <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-card pb-[env(safe-area-inset-bottom)] md:hidden">
        {NAV.filter((n) => n.primary).map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} aria-current={active(path, href) ? "page" : undefined} className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[11px] ${active(path, href) ? "font-semibold text-brand" : "text-muted"}`}>
            <Icon className="h-5 w-5" /> {label}
          </Link>
        ))}
        <button type="button" onClick={() => setMore(true)} className="flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[11px] text-muted">
          <MoreHorizontal className="h-5 w-5" /> More
        </button>
      </nav>

      {more && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="More pages">
          <button type="button" className="absolute inset-0 bg-black/50" onClick={() => setMore(false)} aria-label="Close menu" />
          <div className="absolute inset-x-0 bottom-0 rounded-t-3xl border-t border-line bg-card p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-semibold">More</span>
              <button type="button" className="btn !min-h-[40px] !px-3" onClick={() => setMore(false)} aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {NAV.filter((n) => !n.primary).map(({ href, label, icon: Icon }) => (
                <Link key={href} href={href} onClick={() => setMore(false)} className="btn justify-start">
                  <Icon className="h-4 w-4" /> {label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
