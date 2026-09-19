// Issue #48 (Lab 3) — approved status transition matrix (specification.md
// §5 BR-25–BR-33, AC-11). Authoritative source is the specification table;
// this module is its executable mirror. `NEW → OPEN` occurs only through
// first Claim/Assign — the generic status endpoint must reject it.

const TRANSITIONS: ReadonlyMap<string, ReadonlyArray<string>> = new Map([
  ["NEW", ["OPEN", "CANCELLED"]],
  ["OPEN", ["IN_PROGRESS", "CANCELLED"]],
  ["IN_PROGRESS", ["WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"]],
  ["WAITING_FOR_REQUESTER", ["IN_PROGRESS", "RESOLVED", "CANCELLED"]],
  ["RESOLVED", ["CLOSED", "REOPENED"]],
  ["CLOSED", ["REOPENED"]],
  ["REOPENED", ["IN_PROGRESS", "CANCELLED"]],
  ["CANCELLED", []],
]);

export function getAllowedTransitions(from: string): string[] {
  return [...(TRANSITIONS.get(from) ?? [])];
}

export function isTransitionAllowed(from: string, to: string): boolean {
  if (from === to) return false;
  return TRANSITIONS.get(from)?.includes(to) ?? false;
}

// States where a non-terminal Ticket must reference an active eligible
// owner after the transition (api-spec §11 rules).
const OWNER_REQUIRED = new Set([
  "OPEN",
  "IN_PROGRESS",
  "WAITING_FOR_REQUESTER",
  "RESOLVED",
  "REOPENED",
]);

export function statusRequiresOwner(status: string): boolean {
  return OWNER_REQUIRED.has(status);
}
