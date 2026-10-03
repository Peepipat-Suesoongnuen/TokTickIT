// Lab 4 (Issue #80, BR-017/BR-018/BR-022) — dashboard metric primitives.
//
// Pure helpers shared by the dashboard endpoints and their tests. The
// 30-day window is always derived from a single server-captured `now`
// passed in by the caller — never from per-row DB now() — so membership
// is deterministic for a whole response (API-22/22b).

export const MS_PER_DAY = 86_400_000;
export const COMPLETION_WINDOW_DAYS = 30;

export const NON_TERMINAL_TICKET_STATUSES: ReadonlySet<string> = new Set([
  "NEW",
  "OPEN",
  "IN_PROGRESS",
  "WAITING_FOR_REQUESTER",
  "REOPENED",
]);

export const URGENT_PRIORITIES: ReadonlySet<string> = new Set(["HIGH", "CRITICAL"]);

// Shared EXISTS fragment for "open (PLANNED/IN_PROGRESS) actions assigned
// to a user". Used by assignedToMe AND the ?assignee= queue filter so the
// metric and its drill-down destination are dataset-identical by
// construction (C-80-08). Compose as `actions: { some: ... }`.
export function openAssignedActionSome(assigneeId: number): {
  assignedToId: number;
  status: { in: ["PLANNED", "IN_PROGRESS"] };
} {
  return {
    assignedToId: assigneeId,
    status: { in: ["PLANNED", "IN_PROGRESS"] },
  };
}

export function windowBounds(now: Date): { start: Date; end: Date } {
  return { start: new Date(now.getTime() - COMPLETION_WINDOW_DAYS * MS_PER_DAY), end: new Date(now.getTime()) };
}

function toTime(value: Date | string): number {
  const t = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return t;
}

/** Inclusive on both ends: `start <= occurredAt <= end` (lower inclusive per BR-018; upper excludes skew). */
export function isCompletedInWindow(occurredAt: Date | string, start: Date, end: Date): boolean {
  const t = toTime(occurredAt);
  if (Number.isNaN(t)) return false;
  return t >= start.getTime() && t <= end.getTime();
}

export function compareUpdatedDesc(
  a: { updatedAt: Date | string; id: number },
  b: { updatedAt: Date | string; id: number },
): number {
  const diff = toTime(b.updatedAt) - toTime(a.updatedAt);
  if (diff !== 0) return diff > 0 ? 1 : -1;
  return b.id - a.id;
}

function urgencyRank(itPriority: string): number {
  if (itPriority === "CRITICAL") return 0;
  if (itPriority === "HIGH") return 1;
  return 2;
}

export function compareUrgentDesc(
  a: { itPriority: string; updatedAt: Date | string; id: number },
  b: { itPriority: string; updatedAt: Date | string; id: number },
): number {
  const rank = urgencyRank(a.itPriority) - urgencyRank(b.itPriority);
  if (rank !== 0) return rank;
  return compareUpdatedDesc(a, b);
}

export function truncateTop<T>(rows: readonly T[], n: number): T[] {
  return rows.slice(0, Math.max(0, n));
}
