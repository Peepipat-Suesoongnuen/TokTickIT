import { getPrisma } from "../src/prisma.js";
import { canonicalizeEmail } from "../src/lib/identity.js";

// MIG-02b: fail BEFORE any mutation if two requester emails canonicalize equal.
// Pre-migration verification helper. The DevelopmentRequester model was dropped
// from the Prisma schema by this migration, so the check runs via $queryRaw
// against the pre-migration "DevelopmentRequester" table (used by tests on
// pre-migration snapshots); canonicalization itself uses the shared helper.
export async function assertNoEmailCollision(): Promise<void> {
  const prisma = getPrisma();
  const rows = await prisma.$queryRaw<Array<{ id: number; email: string }>>`
    SELECT id, email FROM "DevelopmentRequester"
  `;
  const seen = new Map<string, number>();
  for (const r of rows) {
    const c = canonicalizeEmail(r.email);
    if (seen.has(c)) {
      throw new Error(
        `MIG-02b email collision: requester ${seen.get(c)} and ${r.id} both canonicalize to ${c}; aborting before mutation`
      );
    }
    seen.set(c, r.id);
  }
}
