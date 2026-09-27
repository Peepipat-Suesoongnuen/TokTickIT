export const SUMMARY_MIN = 5;
export const SUMMARY_MAX = 120;
export const DESC_MIN = 20;
export const DESC_MAX = 2000;

export const ALLOWED_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type RequestedPriority = (typeof ALLOWED_PRIORITIES)[number];

export function trimValue(v: string): string {
  return v.trim();
}

export function isSummaryValid(summary: string): boolean {
  const t = trimValue(summary);
  return t.length >= SUMMARY_MIN && t.length <= SUMMARY_MAX;
}

export function isDescriptionValid(description: string): boolean {
  const t = trimValue(description);
  return t.length >= DESC_MIN && t.length <= DESC_MAX;
}

export function isPriorityValid(p: string): boolean {
  return (ALLOWED_PRIORITIES as readonly string[]).includes(p);
}

// Issue #49 (Lab 3) — Public Comment / Internal Note content rules
// (BR-36–BR-38): plain text, outer whitespace trimmed, whitespace-only
// rejected, channel-specific lengths (comment 1–200, note 1–2000).
export const PUBLIC_COMMENT_MIN = 1;
export const PUBLIC_COMMENT_MAX = 200;
export const INTERNAL_NOTE_MIN = 1;
export const INTERNAL_NOTE_MAX = 2000;

export function normalizeMessageContent(content: string): string {
  return trimValue(content);
}

function isMessageValid(content: unknown, min: number, max: number): boolean {
  if (typeof content !== "string") return false;
  const t = trimValue(content);
  return t.length >= min && t.length <= max;
}

export function isPublicCommentValid(content: unknown): boolean {
  return isMessageValid(content, PUBLIC_COMMENT_MIN, PUBLIC_COMMENT_MAX);
}

export function isInternalNoteValid(content: unknown): boolean {
  return isMessageValid(content, INTERNAL_NOTE_MIN, INTERNAL_NOTE_MAX);
}
