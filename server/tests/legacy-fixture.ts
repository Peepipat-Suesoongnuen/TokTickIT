import type { getPrisma } from "../src/prisma.js";

// Test-only helper (Issue #44): allocate a DevelopmentRequester fixture whose id
// is free in BOTH the legacy table and "User", then mirror it as a same-id User
// (Ticket.requesterId FKs User(id) while routes validate DevelopmentRequester).
//
// Background: seed inserts legacy rows with explicit ids without advancing the
// Postgres sequences, so naive autoincrement fixture ids land inside the seed
// User id range (e.g. DevReq 7 vs seed "IT Staff Two" id 7). The same-id mirror
// upsert then no-ops (update: {}) and ticket joins resolve to the seed row.
// Allocating above GREATEST(MAX(User.id), MAX(DevelopmentRequester.id)) keeps
// the pair collision-free on fresh and long-lived DBs alike.
type Prisma = ReturnType<typeof getPrisma>;

const FIXTURE_PASSWORD_HASH = "lab2-fixture-hash";

function isP2002(e: unknown): boolean {
  return (e as { code?: string } | null)?.code === "P2002";
}

async function freshMatchedId(prisma: Prisma): Promise<number> {
  const [u, d] = await Promise.all([
    prisma.user.aggregate({ _max: { id: true } }),
    prisma.developmentRequester.aggregate({ _max: { id: true } }),
  ]);
  return Math.max(u._max.id ?? 0, d._max.id ?? 0) + 1;
}

// Advance BOTH autoincrement sequences past the greatest id in EITHER table
// (explicit-id inserts never advance sequences on their own). Uses
// pg_get_serial_sequence so no sequence name is hardcoded; COALESCE keeps empty
// tables at 0 so the next nextval() yields 1.
export async function resyncLegacySequences(prisma: Prisma): Promise<void> {
  await prisma.$executeRawUnsafe(
    `SELECT setval(pg_get_serial_sequence('"DevelopmentRequester"', 'id'), ` +
      `(SELECT GREATEST(COALESCE(MAX(id), 0), COALESCE((SELECT MAX(id) FROM "User"), 0)) FROM "DevelopmentRequester"))`
  );
  await prisma.$executeRawUnsafe(
    `SELECT setval(pg_get_serial_sequence('"User"', 'id'), ` +
      `(SELECT GREATEST(COALESCE(MAX(id), 0), COALESCE((SELECT MAX(id) FROM "DevelopmentRequester"), 0)) FROM "User"))`
  );
}

async function ensureMirror(
  prisma: Prisma,
  id: number,
  opts: { name: string; email: string; isActive: boolean }
): Promise<void> {
  const mirror = await prisma.user.findUnique({ where: { id } });
  if (!mirror) {
    try {
      await prisma.user.create({
        data: {
          id,
          name: opts.name,
          email: opts.email,
          passwordHash: FIXTURE_PASSWORD_HASH,
          role: "REQUESTER",
          isActive: opts.isActive,
          mustChangePassword: true,
          failedLoginAttempts: 0,
        },
      });
    } catch (e) {
      if (!isP2002(e)) throw e;
      const raced = await prisma.user.findUniqueOrThrow({ where: { id } });
      if (raced.email !== opts.email) throw e;
    }
  } else if (mirror.email !== opts.email) {
    throw Object.assign(new Error(`legacy fixture id collision: User ${id} is ${mirror.email}`), {
      code: "FIXTURE_ID_COLLISION",
    });
  }
}

// Create-missing-only (heals name/isActive on rerun, never touches other rows).
// Swallows ONLY P2002 (lost allocation race) by re-reading the winner.
export async function ensureMirroredLegacyRequester(
  prisma: Prisma,
  opts: { name: string; email: string; isActive?: boolean }
): Promise<{ id: number; name: string; email: string; isActive: boolean }> {
  const name = opts.name;
  const email = opts.email;
  const isActive = opts.isActive ?? true;

  const existing = await prisma.developmentRequester.findUnique({ where: { email } });
  if (existing) {
    await prisma.developmentRequester.update({ where: { email }, data: { name, isActive } });
    try {
      await ensureMirror(prisma, existing.id, { name, email, isActive });
    } catch (e) {
      if ((e as { code?: string })?.code !== "FIXTURE_ID_COLLISION") throw e;
      // Id space collision with a different (seed) user: relocate this fixture
      // row above both maxes (DevelopmentRequester has no dependents) and mirror.
      const id = await freshMatchedId(prisma);
      await prisma.developmentRequester.update({ where: { email }, data: { id } });
      await ensureMirror(prisma, id, { name, email, isActive });
      await resyncLegacySequences(prisma);
      return { id, name, email, isActive };
    }
    return { id: existing.id, name, email, isActive };
  }

  const id = await freshMatchedId(prisma);
  try {
    await prisma.developmentRequester.create({ data: { id, name, email, isActive } });
  } catch (e) {
    if (!isP2002(e)) throw e;
    const raced = await prisma.developmentRequester.findUniqueOrThrow({ where: { email } });
    await ensureMirror(prisma, raced.id, { name, email, isActive });
    return { id: raced.id, name, email, isActive };
  }
  await ensureMirror(prisma, id, { name, email, isActive });
  await resyncLegacySequences(prisma);
  return { id, name, email, isActive };
}
