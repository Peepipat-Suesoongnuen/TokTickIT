import { PrismaClient } from "@prisma/client";
import { verifyPassword } from "../src/lib/password-hash.js";
import {
  LOCAL_INITIAL_PASSWORD,
  MIGRATED_PASSWORD_BACKFILL_MARKER,
} from "../src/lib/migrated-credentials.js";

// Migration-proof verifier: runs AFTER full `migrate deploy` + backfill on
// the scratch DB. Fails (non-zero exit) on the first violated assertion.
// Runnable: DATABASE_URL=<scratch> npx tsx prisma/migration-proof-verify.ts
const prisma = new PrismaClient();

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`MIGRATION-PROOF FAIL: ${msg}`);
  console.log(`ok - ${msg}`);
}

async function main(): Promise<void> {
  // Legacy rows present (colliding Alice pair was deleted pre-redeploy by design).
  const legacy = await prisma.developmentRequester.findMany({
    where: { email: { contains: "@example.com" } },
    orderBy: { id: "asc" },
  });
  assert(legacy.length === 2, `2 clean legacy requesters present (found ${legacy.length})`);

  // MIG-01: exact old requester id == new User id, canonical email, same name/isActive.
  for (const r of legacy) {
    const u = await prisma.user.findUnique({ where: { id: r.id } });
    assert(u != null, `User row exists with same id=${r.id}`);
    assert(u!.email === r.email.trim().toLowerCase(), `User id=${r.id} email canonical (${u!.email})`);
    assert(u!.name === r.name, `User id=${r.id} name preserved`);
    assert(u!.isActive === r.isActive, `User id=${r.id} isActive preserved`);
    assert(u!.role === "REQUESTER", `User id=${r.id} role REQUESTER`);
    assert(u!.mustChangePassword === true, `User id=${r.id} mustChangePassword`);
  }

  // MIG-02: every MIGPROOF ticket joins; attachment rows intact with same counts.
  const tickets = await prisma.ticket.findMany({
    where: { ticketNumber: { startsWith: "MIGPROOF-" } },
    include: { requester: true },
  });
  assert(tickets.length === 4, `4 MIGPROOF tickets present (found ${tickets.length})`);
  for (const t of tickets) {
    assert(t.requester.id === t.requesterId, `ticket ${t.ticketNumber} requester joins (requesterId=${t.requesterId})`);
    // MIG-03: itPriority initialized from requestedPriority.
    assert(String(t.itPriority) === String(t.requestedPriority), `ticket ${t.ticketNumber} itPriority == requestedPriority (${t.requestedPriority})`);
  }
  const attachments = await prisma.attachment.findMany({
    where: { storedFilename: { startsWith: "migproof-" } },
  });
  assert(attachments.length === 1, `1 MIGPROOF attachment intact (found ${attachments.length})`);
  for (const a of attachments) {
    const t = await prisma.ticket.findUnique({ where: { id: a.ticketId } });
    assert(t != null, `attachment id=${a.id} still points at ticket id=${a.ticketId}`);
  }

  // MIG-04: no marker rows left; migrated hashes distinct + $argon2id$ + verify.
  const leftover = await prisma.user.count({ where: { passwordHash: MIGRATED_PASSWORD_BACKFILL_MARKER } });
  assert(leftover === 0, `no ${MIGRATED_PASSWORD_BACKFILL_MARKER} rows remain`);
  const migrated = await prisma.user.findMany({ where: { id: { in: legacy.map((r) => r.id) } } });
  const hashes = migrated.map((u) => u.passwordHash);
  assert(new Set(hashes).size === hashes.length, "migrated hashes distinct per row");
  for (const u of migrated) {
    assert(u.passwordHash.startsWith("$argon2id$"), `User id=${u.id} hash is $argon2id$`);
    assert(await verifyPassword(u.passwordHash, LOCAL_INITIAL_PASSWORD), `User id=${u.id} hash verifies against local initial password`);
  }

  // Unique index exists + enforced: LOWER(email) duplicate must be rejected.
  const idx = await prisma.$queryRaw<Array<{ indexname: string }>>`
    SELECT indexname FROM pg_indexes WHERE tablename = 'User' AND indexname = 'User_email_ci_unique'
  `;
  assert(idx.length === 1, "unique index User_email_ci_unique exists");
  let rejected = false;
  try {
    await prisma.user.create({
      data: {
        name: "Migproof Dup",
        email: legacy[0].email.toUpperCase(),
        passwordHash: "$argon2id$proof-rejected",
        role: "REQUESTER",
      },
    });
  } catch {
    rejected = true;
  }
  assert(rejected, `LOWER(email) duplicate of ${legacy[0].email} rejected`);
  console.log("migration-proof: ALL CHECKS PASSED");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
