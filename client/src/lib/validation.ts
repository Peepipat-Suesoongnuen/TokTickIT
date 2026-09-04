export const SUMMARY_MIN = 5;
export const SUMMARY_MAX = 120;
export const DESC_MIN = 20;
export const DESC_MAX = 2000;

export const ALLOWED_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

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
