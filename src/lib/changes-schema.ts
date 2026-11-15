import { z } from "zod";
import { LIMITS, validateDescription, validateTags, validateTitle } from "@/lib/youtube-limits";

const idRe = /^[A-Za-z0-9_-]{5,64}$/;
export const ytId = z.string().regex(idRe, "Invalid YouTube ID");

const title = z.string().superRefine((v, ctx) => {
  const m = validateTitle(v);
  if (m) ctx.addIssue({ code: "custom", message: m });
});
const description = z.string().superRefine((v, ctx) => {
  const m = validateDescription(v);
  if (m) ctx.addIssue({ code: "custom", message: m });
});
const tags = z
  .array(z.string().trim().min(1).max(100))
  .max(60)
  .superRefine((v, ctx) => {
    const m = validateTags(v);
    if (m) ctx.addIssue({ code: "custom", message: m });
  });

export const videoMetadataInput = z
  .object({ kind: z.literal("video_metadata"), videoId: ytId, title: title.optional(), description: description.optional(), tags: tags.optional() })
  .refine((v) => v.title !== undefined || v.description !== undefined || v.tags !== undefined, {
    message: "Provide at least one of title, description or tags.",
  });

export const playlistCreateInput = z.object({
  kind: z.literal("playlist_create"),
  title: z.string().min(1).max(LIMITS.playlistTitleMax).refine((v) => !/[<>]/.test(v), "Title cannot contain < or >."),
  description: description.default(""),
  privacy: z.enum(["private", "unlisted", "public"]).default("private"),
});

export const playlistUpdateInput = z
  .object({
    kind: z.literal("playlist_update"),
    playlistId: ytId,
    title: z.string().min(1).max(LIMITS.playlistTitleMax).refine((v) => !/[<>]/.test(v), "Title cannot contain < or >.").optional(),
    description: description.optional(),
  })
  .refine((v) => v.title !== undefined || v.description !== undefined, { message: "Provide a title or description." });

export const playlistAddVideoInput = z.object({ kind: z.literal("playlist_add_video"), playlistId: ytId, videoId: ytId });

export const changeInput = z.discriminatedUnion("kind", [
  // discriminatedUnion needs plain objects; refinements are re-applied in parseChangeInput.
  z.object({ kind: z.literal("video_metadata"), videoId: ytId, title: title.optional(), description: description.optional(), tags: tags.optional() }),
  playlistCreateInput,
  z.object({ kind: z.literal("playlist_update"), playlistId: ytId, title: z.string().min(1).max(LIMITS.playlistTitleMax).optional(), description: description.optional() }),
  playlistAddVideoInput,
]);

export type ChangeInput = z.infer<typeof changeInput>;

export function parseChangeInput(raw: unknown): ChangeInput {
  const base = changeInput.parse(raw);
  if (base.kind === "video_metadata") videoMetadataInput.parse(base);
  if (base.kind === "playlist_update") playlistUpdateInput.parse(base);
  return base;
}
