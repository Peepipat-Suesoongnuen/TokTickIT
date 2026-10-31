// Lab 4 (Issue #79, BR-011/BR-012/BR-029) — resolution gate predicate.
// Pure function over same-shape action summaries; the status route MUST
// delegate to it so the gate rule exists in exactly one place. Cycle
// scoping is by equality against the Ticket row value passed in — the
// function never derives cycles from child rows.

export type GateActionSummary = {
  id: number;
  status: string;
  cycle: number;
};

export type GateVerdict =
  | { ok: true }
  | { ok: false; reason: "NO_COMPLETED_ACTION"; currentCycle: number }
  | { ok: false; reason: "OPEN_ACTIONS"; currentCycle: number; openActionIds: number[] };

const OPEN_STATUSES = new Set(["PLANNED", "IN_PROGRESS"]);

export function evaluateGate(actions: GateActionSummary[], currentCycle: number): GateVerdict {
  const sameCycle = actions.filter((a) => a.cycle === currentCycle);
  if (!sameCycle.some((a) => a.status === "COMPLETED")) {
    return { ok: false, reason: "NO_COMPLETED_ACTION", currentCycle };
  }
  const openActionIds = sameCycle
    .filter((a) => OPEN_STATUSES.has(a.status))
    .map((a) => a.id)
    .sort((x, y) => x - y);
  if (openActionIds.length > 0) {
    return { ok: false, reason: "OPEN_ACTIONS", currentCycle, openActionIds };
  }
  return { ok: true };
}
