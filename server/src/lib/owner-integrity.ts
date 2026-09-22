import type { PrismaClient } from "@prisma/client";

// Issue #48 (Lab 3) — shared BR-76 owner-integrity concurrency protocol
// (specification.md BR-76, api-spec §15).
//
// Any operation that establishes or changes the owner of a non-terminal
// Ticket (Claim, first Assign, Reassign, Reopen owner repair) and any
// Administrator update that could make the same target User owner-ineligible
// must serialize on the affected User row and revalidate eligibility at
// commit time. Both conflicting operations must never commit to an invalid
// final state; the loser receives a safe 409.
//
// Mechanism: SELECT ... FOR UPDATE on the target User row inside the same
// transaction that performs the conditional Ticket mutation. The
// Administrator side (#50) locks the same row, so overlapping operations
// serialize: the second committer re-reads post-commit state and fails
// safely instead of racing past a stale eligibility read.
//
// The $queryRaw call below is parameterized through Prisma's template-tag
// binding (no string concatenation of client input — BR-74 safe); the
// locked id is always a server-side number.

export const OWNER_ELIGIBLE_ROLES = new Set(["IT_STAFF", "ADMINISTRATOR"]);

export interface OwnerEligibilityRow {
  id: number;
  role: string;
  isActive: boolean;
}

export function isOwnerEligible(user: OwnerEligibilityRow | null | undefined): boolean {
  if (!user) return false;
  return user.isActive && OWNER_ELIGIBLE_ROLES.has(user.role);
}

type LockableDb = Pick<PrismaClient, "$queryRaw">;

export async function lockUserRowForUpdate(
  db: LockableDb,
  userId: number
): Promise<OwnerEligibilityRow | null> {
  const rows = await db.$queryRaw<OwnerEligibilityRow[]>`
    SELECT "id", "role", "isActive" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
  if (rows.length === 0) return null;
  return rows[0];
}

// Issue #50 (BR-43) — last-active-Administrator invariant. Locks every
// currently active Administrator row so concurrent eligibility-changing
// updates serialize: the second committer re-evaluates on post-commit
// state and exactly one of them survives. Rows are locked one by one in
// ascending id order: a bare SELECT ... FOR UPDATE acquires locks in scan
// order (not ORDER BY output order), which deadlocks concurrent lockers.
// The role literal is a server-side constant (BR-74 safe).
export async function lockActiveAdminsForUpdate(
  db: LockableDb & Pick<PrismaClient, "user">
): Promise<number[]> {
  const actives = await db.user.findMany({
    where: { role: "ADMINISTRATOR", isActive: true },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  const locked: number[] = [];
  for (const row of actives) {
    const got = await lockUserRowForUpdate(db, row.id);
    if (got && got.isActive && got.role === "ADMINISTRATOR") locked.push(got.id);
  }
  return locked;
}
