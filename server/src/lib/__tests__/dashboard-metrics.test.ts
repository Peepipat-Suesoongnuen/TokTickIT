import { describe, it, expect } from "vitest";
import {
  windowBounds,
  isCompletedInWindow,
  compareUpdatedDesc,
  compareUrgentDesc,
  truncateTop,
  NON_TERMINAL_TICKET_STATUSES,
} from "../dashboard-metrics.js";

// Issue #80 (UNIT-03) — dashboard metric primitives: attribution splits,
// urgent vs recent ordering, 30-day window edges, tie-breaks, top-N
// truncation, empty sets. Pure functions; DB-backed counts are proven by
// API-21–24 against direct queries.
const DAY = 86_400_000;

describe("dashboard metric primitives (Issue #80, UNIT-03)", () => {
  it("computes a trailing 30x24h window from a single capture", () => {
    const now = new Date("2026-10-03T12:00:00.000Z");
    const { start, end } = windowBounds(now);
    expect(end.getTime()).toBe(now.getTime());
    expect(start.getTime()).toBe(now.getTime() - 30 * DAY);
  });

  it("includes the lower bound and excludes anything after the capture", () => {
    const now = new Date("2026-10-03T12:00:00.000Z");
    const { start, end } = windowBounds(now);
    // Inclusive lower bound (API-22): exactly now-30d counts.
    expect(isCompletedInWindow(new Date(start.getTime()), start, end)).toBe(true);
    // Skew exclusion (API-22b): now+1s and future instants never count,
    // even though they are "recent".
    expect(isCompletedInWindow(new Date(now.getTime() + 1000), start, end)).toBe(false);
    expect(isCompletedInWindow(new Date(now.getTime() + DAY), start, end)).toBe(false);
    // Before the window never counts.
    expect(isCompletedInWindow(new Date(start.getTime() - 1), start, end)).toBe(false);
  });

  it("orders updatedAt DESC with id DESC tie-break", () => {
    const rows = [
      { id: 3, updatedAt: "2026-10-01T00:00:00.000Z" },
      { id: 1, updatedAt: "2026-10-02T00:00:00.000Z" },
      { id: 2, updatedAt: "2026-10-02T00:00:00.000Z" },
    ];
    expect([...rows].sort(compareUpdatedDesc).map((r) => r.id)).toEqual([2, 1, 3]);
  });

  it("ranks CRITICAL above HIGH, then recency, then id", () => {
    const rows = [
      { id: 1, itPriority: "HIGH", updatedAt: "2026-10-03T00:00:00.000Z" },
      { id: 2, itPriority: "CRITICAL", updatedAt: "2026-10-01T00:00:00.000Z" },
      { id: 3, itPriority: "CRITICAL", updatedAt: "2026-10-03T00:00:00.000Z" },
      { id: 4, itPriority: "MEDIUM", updatedAt: "2026-10-04T00:00:00.000Z" },
    ];
    expect([...rows].sort(compareUrgentDesc).map((r) => r.id)).toEqual([3, 2, 1, 4]);
  });

  it("truncates top-N and treats empty sets as empty", () => {
    expect(truncateTop([1, 2, 3, 4, 5, 6, 7, 8, 9], 8)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(truncateTop([], 5)).toEqual([]);
    expect(truncateTop([1], 5)).toEqual([1]);
  });

  it("defines the non-terminal set shared by open metrics", () => {
    expect([...NON_TERMINAL_TICKET_STATUSES].sort()).toEqual(
      ["IN_PROGRESS", "NEW", "OPEN", "REOPENED", "WAITING_FOR_REQUESTER"].sort(),
    );
    expect(NON_TERMINAL_TICKET_STATUSES.has("RESOLVED")).toBe(false);
    expect(NON_TERMINAL_TICKET_STATUSES.has("CLOSED")).toBe(false);
    expect(NON_TERMINAL_TICKET_STATUSES.has("CANCELLED")).toBe(false);
  });
});
