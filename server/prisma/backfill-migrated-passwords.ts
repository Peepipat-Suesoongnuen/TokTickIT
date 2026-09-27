import { getPrisma } from "../src/prisma.js";
import { backfillMigratedCredentials } from "../src/lib/migrated-credentials.js";

// One-shot backfill for migration-inserted Users: replaces the
// MIGRATED_NEEDS_BACKFILL marker with unique per-row Argon2id hashes.
// Runnable: npx tsx prisma/backfill-migrated-passwords.ts with DATABASE_URL
// pointed at the target DB (run after `prisma migrate deploy`).
const prisma = getPrisma();
backfillMigratedCredentials(prisma)
  .then(({ updated }) => {
    console.log(`Backfilled ${updated} migrated credential(s).`);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
