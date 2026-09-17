import { getPrisma } from "../prisma.js";
import { hashPassword } from "./password-hash.js";

// Local/testing-only initial credential (BR-52), same literal as the Task 4
// migration — never commit real secrets. Single source of truth shared by
// seed.ts and the migration backfill below.
export const LOCAL_INITIAL_PASSWORD = "Requester#2026-local";

// Placeholder written by migration SQL for migrated users' passwordHash.
// Pure SQL cannot Argon2, so the migration inserts this marker (fails closed
// on login — not a valid PHC string) and the backfill replaces it with a
// unique per-row Argon2id hash. mustChangePassword=true stays set.
export const MIGRATED_PASSWORD_BACKFILL_MARKER = "MIGRATED_NEEDS_BACKFILL";

type Prisma = ReturnType<typeof getPrisma>;

// Replace every marker passwordHash with a fresh hashPassword() call per row
// (unique random salt per credential, api-spec.md:37). Idempotent: only
// marker rows are touched, so a second run updates 0 rows.
export async function backfillMigratedCredentials(prisma: Prisma = getPrisma()): Promise<{ updated: number }> {
  const pending = await prisma.user.findMany({
    where: { passwordHash: MIGRATED_PASSWORD_BACKFILL_MARKER },
    select: { id: true },
  });
  for (const row of pending) {
    const passwordHash = await hashPassword(LOCAL_INITIAL_PASSWORD);
    await prisma.user.update({ where: { id: row.id }, data: { passwordHash } });
  }
  return { updated: pending.length };
}
