"use client";
import type { Video } from "@/types";

export function VideoPicker({ videos, value, onChange }: { videos: Video[]; value: string; onChange: (id: string) => void }) {
  return (
    <div>
      <label className="label" htmlFor="video-picker">Video</label>
      <select id="video-picker" className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Select a video…</option>
        {videos.map((v) => (
          <option key={v.id} value={v.id}>
            {v.title.length > 80 ? v.title.slice(0, 77) + "…" : v.title}
          </option>
        ))}
      </select>
    </div>
  );
}
