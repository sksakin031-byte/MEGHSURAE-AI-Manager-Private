import { describe, expect, it } from "vitest";
import { parseChangeInput } from "@/lib/changes-schema";

describe("change input validation", () => {
  it("accepts a valid metadata change", () => {
    const c = parseChangeInput({ kind: "video_metadata", videoId: "dQw4w9WgXcQ", title: "New title", tags: ["a", "b"] });
    expect(c.kind).toBe("video_metadata");
  });
  it("rejects empty changes, bad ids and over-limit fields", () => {
    expect(() => parseChangeInput({ kind: "video_metadata", videoId: "dQw4w9WgXcQ" })).toThrow();
    expect(() => parseChangeInput({ kind: "video_metadata", videoId: "../etc", title: "x" })).toThrow();
    expect(() => parseChangeInput({ kind: "video_metadata", videoId: "dQw4w9WgXcQ", title: "a".repeat(101) })).toThrow();
    expect(() => parseChangeInput({ kind: "delete_video", videoId: "dQw4w9WgXcQ" })).toThrow();
  });
  it("defaults new playlists to private", () => {
    const c = parseChangeInput({ kind: "playlist_create", title: "My list" });
    expect(c.kind === "playlist_create" && c.privacy).toBe("private");
  });
  it("there is no delete kind at all", () => {
    expect(() => parseChangeInput({ kind: "playlist_delete", playlistId: "PLabcdefghij" })).toThrow();
  });
});
