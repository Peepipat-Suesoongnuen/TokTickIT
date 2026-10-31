import { describe, expect, it } from "vitest";
import { isActionTransitionAllowed } from "../action-lifecycle.js";

// UNIT-04: lifecycle transition table incl. forbidden pairs (BR-003, AC-004).
describe("action-lifecycle (UNIT-04)", () => {
  it("allows the specified transitions only", () => {
    expect(isActionTransitionAllowed("PLANNED", "IN_PROGRESS")).toBe(true);
    expect(isActionTransitionAllowed("PLANNED", "CANCELLED")).toBe(true);
    expect(isActionTransitionAllowed("IN_PROGRESS", "COMPLETED")).toBe(true);
    expect(isActionTransitionAllowed("IN_PROGRESS", "CANCELLED")).toBe(true);
  });

  it("rejects skips, backward moves, terminal exits, and unknown states", () => {
    expect(isActionTransitionAllowed("PLANNED", "COMPLETED")).toBe(false);
    expect(isActionTransitionAllowed("IN_PROGRESS", "PLANNED")).toBe(false);
    expect(isActionTransitionAllowed("COMPLETED", "IN_PROGRESS")).toBe(false);
    expect(isActionTransitionAllowed("CANCELLED", "PLANNED")).toBe(false);
    expect(isActionTransitionAllowed("COMPLETED", "CANCELLED")).toBe(false);
    expect(isActionTransitionAllowed("PLANNED", "BANANA")).toBe(false);
    expect(isActionTransitionAllowed("BANANA", "IN_PROGRESS")).toBe(false);
  });
});
