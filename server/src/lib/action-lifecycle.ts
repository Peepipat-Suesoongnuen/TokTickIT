// Lab 4 (Issue #77) — ActionTaken lifecycle transition table (BR-003).
// PLANNED → IN_PROGRESS → COMPLETED, with PLANNED → CANCELLED and
// IN_PROGRESS → CANCELLED branches. Terminal states have no outbound moves.
const ALLOWED: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["PLANNED", new Set(["IN_PROGRESS", "CANCELLED"])],
  ["IN_PROGRESS", new Set(["COMPLETED", "CANCELLED"])],
  ["COMPLETED", new Set()],
  ["CANCELLED", new Set()],
]);

export function isActionTransitionAllowed(from: unknown, to: unknown): boolean {
  if (typeof from !== "string" || typeof to !== "string") return false;
  return ALLOWED.get(from)?.has(to) ?? false;
}
