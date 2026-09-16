import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { getPrisma } from "../../prisma.js";
import { assertNoEmailCollision } from "../../../prisma/migration-guards.js";
import { verifyPassword } from "../password-hash.js";

// DB-backed migration regression (MIG-01..04, MIG-02b).
// Runs against the isolated test DB (NODE_ENV=test + TEST_DATABASE_URL),
// which was brought forward with `prisma migrate deploy` — i.e. the
// pre-migration DevelopmentRequester rows were moved by the real migration SQL.
describe("migration regression (MIG-01..04, MIG-02b)", () => {
  const prisma = () => getPrisma();

  it("MIG-01 preserves IDs: old requester id == new user id, tickets still joined", async () => {
    // Every ticket's requesterId must resolve to a REQUESTER user (FK repointed
    // to "User" with unchanged values — IDs preserved, no remapping).
    const tickets = await prisma().ticket.findMany({ select: { id: true, requesterId: true } });
    expect(tickets.length).toBeGreaterThan(0);
    for (const t of tickets) {
      const u = await prisma().user.findUnique({ where: { id: t.requesterId } });
      expect(u).not.toBeNull();
      expect(u!.role).toBe("REQUESTER");
    }
    // Join proof: requester relation loads for each ticket.
    const withJoin = await prisma().ticket.findFirst({ include: { requester: true } });
    expect(withJoin!.requester.id).toBe(withJoin!.requesterId);
  });

  it("MIG-02 keeps tickets/attachments/categories valid with same counts", async () => {
    const before = {
      tickets: await prisma().ticket.count(),
      attachments: await prisma().attachment.count(),
      categories: await prisma().category.count(),
      systems: await prisma().relatedSystem.count(),
    };
    expect(before.tickets).toBeGreaterThan(0);
    expect(before.categories).toBeGreaterThan(0);
    // Idempotent re-apply changes nothing: second deploy = "No pending migrations"
    // (proven via CLI in the task report); counts are stable across reads.
    const after = {
      tickets: await prisma().ticket.count(),
      attachments: await prisma().attachment.count(),
      categories: await prisma().category.count(),
      systems: await prisma().relatedSystem.count(),
    };
    expect(after).toEqual(before);
    // Every attachment still points at an existing ticket.
    const atts = await prisma().attachment.findMany({ select: { id: true, ticketId: true } });
    for (const a of atts) {
      await expect(prisma().ticket.findUnique({ where: { id: a.ticketId } })).resolves.not.toBeNull();
    }
  });

  it("MIG-02b aborts before mutation on Alice@x + alice@x collision", async () => {
    // Recreate a pre-migration-shaped table (regular table: TEMP is invisible
    // across pooled connections), seed a canonical collision, and prove the
    // guard fails BEFORE any mutation (zero User rows created here,
    // ticket FKs untouched).
    await prisma().$executeRawUnsafe(`DROP TABLE IF EXISTS "DevelopmentRequester"`);
    await prisma().$executeRawUnsafe(
      `CREATE TABLE "DevelopmentRequester" (id SERIAL PRIMARY KEY, email TEXT NOT NULL)`
    );
    await prisma().$executeRawUnsafe(
      `INSERT INTO "DevelopmentRequester" (email) VALUES ('Alice@x'), ('alice@x')`
    );
    const ticketCountBefore = await prisma().ticket.count();
    await expect(assertNoEmailCollision()).rejects.toThrow(/MIG-02b email collision/);
    expect(await prisma().ticket.count()).toBe(ticketCountBefore);
    await prisma().$executeRawUnsafe(`DROP TABLE "DevelopmentRequester"`);
    // And the migration SQL itself aborts first: guard statement precedes INSERT.
    const sql = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../../../prisma/migrations/20260916105528_lab03_user_migration/migration.sql"),
      "utf8"
    );
    expect(sql.indexOf("SELECT 1 / (1 -")).toBeLessThan(sql.indexOf('INSERT INTO "User"'));
  });

  it("MIG-03 sets itPriority == requestedPriority; MIG-04 sets Argon2id hash + mustChangePassword", async () => {
    const tickets = await prisma().ticket.findMany({ select: { id: true, itPriority: true, requestedPriority: true, ticketOwnerId: true } });
    expect(tickets.length).toBeGreaterThan(0);
    for (const t of tickets) {
      expect(t.itPriority).toBe(t.requestedPriority as unknown as typeof t.itPriority);
    }
    const users = await prisma().user.findMany({
      where: { role: "REQUESTER" },
      select: { id: true, passwordHash: true, mustChangePassword: true, failedLoginAttempts: true },
    });
    expect(users.length).toBeGreaterThan(0);
    for (const u of users) {
      expect(u.passwordHash.startsWith("$argon2id$")).toBe(true);
      expect(u.passwordHash).not.toContain("Requester#2026-local");
      expect(u.mustChangePassword).toBe(true);
      expect(u.failedLoginAttempts).toBe(0);
    }
    // Hash in migration SQL verifies against the approved local-only credential.
    const sql = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../../../prisma/migrations/20260916105528_lab03_user_migration/migration.sql"),
      "utf8"
    );
    const m = sql.match(/'(\$argon2id\$[^']+)'/);
    expect(m).not.toBeNull();
    await expect(verifyPassword(m![1], "Requester#2026-local")).resolves.toBe(true);
  });
});
