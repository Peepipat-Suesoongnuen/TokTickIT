import { describe, it, expect } from "vitest";
import { getAllowedTransitions, isTransitionAllowed } from "../ticket-status.js";

// Issue #48 (Lab 3) — UNIT-04: complete status-transition matrix
// (specification.md BR-25–BR-33, AC-11). The matrix is authoritative in
// specification §5; NEW→OPEN is reserved for Claim/Assign and is never
// allowed through the generic status endpoint.
const ALL = [
  "NEW",
  "OPEN",
  "IN_PROGRESS",
  "WAITING_FOR_REQUESTER",
  "RESOLVED",
  "CLOSED",
  "REOPENED",
  "CANCELLED",
] as const;

const ALLOWED: ReadonlyArray<readonly [string, string]> = [
  ["NEW", "OPEN"],
  ["NEW", "CANCELLED"],
  ["OPEN", "IN_PROGRESS"],
  ["OPEN", "CANCELLED"],
  ["IN_PROGRESS", "WAITING_FOR_REQUESTER"],
  ["IN_PROGRESS", "RESOLVED"],
  ["IN_PROGRESS", "CANCELLED"],
  ["WAITING_FOR_REQUESTER", "IN_PROGRESS"],
  ["WAITING_FOR_REQUESTER", "RESOLVED"],
  ["WAITING_FOR_REQUESTER", "CANCELLED"],
  ["RESOLVED", "CLOSED"],
  ["RESOLVED", "REOPENED"],
  ["CLOSED", "REOPENED"],
  ["REOPENED", "IN_PROGRESS"],
  ["REOPENED", "CANCELLED"],
];

describe("status transition matrix (UNIT-04)", () => {
  it("allows every listed transition", () => {
    for (const [from, to] of ALLOWED) {
      expect(isTransitionAllowed(from, to)).toBe(true);
    }
  });

  it("rejects every unlisted transition, including direct NEW→OPEN and terminal exits", () => {
    const allowed = new Set(ALLOWED.map(([f, t]) => `${f}→${t}`));
    for (const from of ALL) {
      for (const to of ALL) {
        if (from === to) {
          expect(isTransitionAllowed(from, to)).toBe(false);
          continue;
        }
        const expected = allowed.has(`${from}→${to}`);
        expect(isTransitionAllowed(from, to)).toBe(expected);
      }
    }
    expect(isTransitionAllowed("RESOLVED", "CANCELLED")).toBe(false);
    expect(isTransitionAllowed("CLOSED", "CANCELLED")).toBe(false);
    expect(isTransitionAllowed("NEW", "RESOLVED")).toBe(false);
    expect(isTransitionAllowed("OPEN", "RESOLVED")).toBe(false);
    expect(isTransitionAllowed("CANCELLED", "REOPENED")).toBe(false);
  });

  it("reports allowed next transitions per state", () => {
    expect(getAllowedTransitions("NEW").sort()).toEqual(["CANCELLED", "OPEN"]);
    expect(getAllowedTransitions("CLOSED")).toEqual(["REOPENED"]);
    expect(getAllowedTransitions("CANCELLED")).toEqual([]);
    expect(getAllowedTransitions("BOGUS")).toEqual([]);
  });
});
