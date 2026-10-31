import { describe, it, expect } from "vitest";
import { evaluateGate } from "../resolution-gate.js";

// Issue #79 (UNIT-02) — gate predicate over (completed-in-cycle,
// open-in-cycle) with legacy and post-reopen cycles. Pure function;
// the route-level gate MUST delegate to it (no duplicated logic).
const COMPLETED_C1 = { id: 1, status: "COMPLETED", cycle: 1 };
const OPEN_C1 = { id: 2, status: "PLANNED", cycle: 1 };
const OPEN_C1B = { id: 5, status: "IN_PROGRESS", cycle: 1 };
const CANCELLED_C1 = { id: 3, status: "CANCELLED", cycle: 1 };
const COMPLETED_C2 = { id: 4, status: "COMPLETED", cycle: 2 };
const OPEN_C2 = { id: 6, status: "PLANNED", cycle: 2 };

describe("resolution gate predicate (Issue #79, UNIT-02)", () => {
  it("blocks unless the current cycle holds a completion", () => {
    expect(evaluateGate([], 1)).toEqual({ ok: false, reason: "NO_COMPLETED_ACTION", currentCycle: 1 });
    expect(evaluateGate([OPEN_C1], 1)).toEqual({ ok: false, reason: "NO_COMPLETED_ACTION", currentCycle: 1 });
    expect(evaluateGate([CANCELLED_C1], 1)).toEqual({ ok: false, reason: "NO_COMPLETED_ACTION", currentCycle: 1 });
  });

  it("blocks on open same-cycle actions with ordered ids", () => {
    expect(evaluateGate([COMPLETED_C1, OPEN_C1B, OPEN_C1], 1)).toEqual({
      ok: false,
      reason: "OPEN_ACTIONS",
      currentCycle: 1,
      openActionIds: [2, 5],
    });
  });

  it("passes a completed cycle with zero open and ignores other cycles", () => {
    expect(evaluateGate([COMPLETED_C1, CANCELLED_C1], 1)).toEqual({ ok: true });
    // Old-cycle completion never satisfies a new gate; new-cycle openness blocks.
    expect(evaluateGate([COMPLETED_C1, OPEN_C2, COMPLETED_C2], 2)).toEqual({
      ok: false,
      reason: "OPEN_ACTIONS",
      currentCycle: 2,
      openActionIds: [6],
    });
    // Legacy rows (cycle 1 on a cycle-1 ticket) behave like ordinary rows.
    expect(evaluateGate([COMPLETED_C1], 1)).toEqual({ ok: true });
  });
});
