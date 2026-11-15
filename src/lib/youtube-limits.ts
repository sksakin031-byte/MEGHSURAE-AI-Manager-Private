// Pure validators for YouTube field limits (documented API/UI limits).
export const LIMITS = {
  titleMax: 100,
  descriptionMaxBytes: 5000,
  tagsMaxChars: 500,
  playlistTitleMax: 150,
} as const;

export function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

export function validateTitle(title: string, max: number = LIMITS.titleMax): string | null {
  if (!title.trim()) return "Title cannot be empty.";
  if (title.length > max) return `Title is ${title.length} characters; the limit is ${max}.`;
  if (/[<>]/.test(title)) return "Title cannot contain < or >.";
  return null;
}

export function validateDescription(desc: string): string | null {
  const bytes = byteLength(desc);
  if (bytes > LIMITS.descriptionMaxBytes) {
    return `Description is ${bytes} bytes; the limit is ${LIMITS.descriptionMaxBytes}. (Bengali characters use 3 bytes each.)`;
  }
  if (/[<>]/.test(desc)) return "Description cannot contain < or >.";
  return null;
}

/** YouTube counts tag length including a 2-char allowance for tags containing spaces (quotes). */
export function tagsLength(tags: string[]): number {
  return tags.reduce((n, t) => n + t.length + (t.includes(" ") ? 2 : 0), 0) + Math.max(0, tags.length - 1);
}

export function validateTags(tags: string[]): string | null {
  if (tags.some((t) => !t.trim())) return "Tags cannot be empty.";
  if (tags.some((t) => /[<>]/.test(t))) return "Tags cannot contain < or >.";
  const total = tagsLength(tags);
  if (total > LIMITS.tagsMaxChars) return `Tags use ${total} characters; the limit is ${LIMITS.tagsMaxChars}.`;
  return null;
}
