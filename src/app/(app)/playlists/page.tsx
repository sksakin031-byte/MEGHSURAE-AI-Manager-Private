"use client";
import { useState } from "react";
import { Card, ErrorNote, InfoNote, PageHeader, SourceNote, Spinner } from "@/components/ui";
import { ProposeButtons } from "@/components/ProposeButtons";
import { useApi } from "@/hooks/useApi";
import { fmtDate } from "@/lib/format";
import type { PlaylistSuggestion } from "@/lib/playlist-suggest";
import type { Playlist, Video } from "@/types";

interface Res {
  playlists: Playlist[];
  suggestions: PlaylistSuggestion[];
  suggestionMethod: string;
  fetchedAt: string;
  source: string;
}

export default function PlaylistsPage() {
  const { data, error, loading } = useApi<Res>("/api/playlists");
  const vids = useApi<{ videos: Video[] }>("/api/videos");
  const [pid, setPid] = useState("");
  const [vid, setVid] = useState("");
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const titleOf = (id: string) => vids.data?.videos.find((v) => v.id === id)?.title ?? id;

  return (
    <>
      <PageHeader title="Playlists" subtitle="Review how your videos are organised. Nothing is created or edited without your approval." />
      <ErrorNote error={error} />
      {loading && <Spinner />}
      {data && (
        <div className="space-y-6">
          <section>
            <h2 className="mb-2 font-semibold">Existing playlists ({data.playlists.length})</h2>
            {data.playlists.length === 0 && <InfoNote>No playlists yet. Grouping videos into playlists helps viewers keep watching.</InfoNote>}
            <div className="space-y-2">
              {data.playlists.map((p) => (
                <Card key={p.id}>
                  <div className="font-medium">{p.title}</div>
                  <div className="text-xs text-muted">{p.itemCount} videos · {p.privacy} · created {fmtDate(p.publishedAt)}</div>
                  {!p.description && <div className="mt-1 text-xs text-warn">No description</div>}
                </Card>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-1 font-semibold">Suggested playlists</h2>
            <p className="mb-2 text-xs text-muted">{data.suggestionMethod}</p>
            {data.suggestions.length === 0 && <InfoNote>Not enough videos with shared topics to suggest groups yet.</InfoNote>}
            <div className="space-y-3">
              {data.suggestions.map((s) => (
                <Card key={s.keyword} className="space-y-2">
                  <div className="font-medium">{s.name}</div>
                  <p className="text-sm text-muted">{s.description}</p>
                  <details className="text-sm">
                    <summary className="cursor-pointer text-muted">{s.videoIds.length} videos</summary>
                    <ul className="mt-1 list-disc pl-5">{s.videoIds.map((id) => <li key={id}>{titleOf(id)}</li>)}</ul>
                  </details>
                  <ProposeButtons change={{ kind: "playlist_create", title: s.name, description: s.description, privacy: "private" }} />
                  <p className="text-xs text-muted">Creates a private playlist. Add videos afterwards with the form below.</p>
                </Card>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-2 font-semibold">Add a video to a playlist</h2>
            <Card className="space-y-3">
              <select className="input" value={pid} onChange={(e) => setPid(e.target.value)} aria-label="Playlist">
                <option value="">Playlist…</option>
                {data.playlists.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
              <select className="input" value={vid} onChange={(e) => setVid(e.target.value)} aria-label="Video">
                <option value="">Video…</option>
                {vids.data?.videos.map((v) => <option key={v.id} value={v.id}>{v.title.slice(0, 80)}</option>)}
              </select>
              <ProposeButtons disabled={!pid || !vid} change={pid && vid ? { kind: "playlist_add_video", playlistId: pid, videoId: vid } : null} />
            </Card>
          </section>

          <section>
            <h2 className="mb-2 font-semibold">Create or rename a playlist</h2>
            <Card className="space-y-3">
              <input className="input" placeholder="Playlist title" value={name} onChange={(e) => setName(e.target.value)} aria-label="Playlist title" />
              <textarea className="input min-h-[80px] py-2" placeholder="Description" value={desc} onChange={(e) => setDesc(e.target.value)} aria-label="Playlist description" />
              <ProposeButtons disabled={!name.trim()} change={name.trim() ? (pid ? { kind: "playlist_update", playlistId: pid, title: name.trim(), description: desc } : { kind: "playlist_create", title: name.trim(), description: desc, privacy: "private" }) : null} />
              <p className="text-xs text-muted">If a playlist is selected above, this updates it; otherwise it creates a new private playlist.</p>
            </Card>
          </section>
          <SourceNote source={data.source} fetchedAt={data.fetchedAt} />
        </div>
      )}
    </>
  );
}
