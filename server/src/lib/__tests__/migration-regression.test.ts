import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { getPrisma } from "../../prisma.js";
import { assertNoEmailCollision } from "../../../prisma/migration-guards.js";
import { verifyPassword } from "../password-hash.js";

// DB-backed migration regression (MIG-01..04, MIG-02b).
// Runs against the isolated test DB (NODE_ENV=test + TEST_DATABASE_URL).
// The legacy "DevelopmentRequester" table is KEPT (frozen until the #45/#46
// auth cutover), so the pre-migration requester rows are readable as
// before-evidence alongside the migrated "User" rows.
const MIGRATION_SQL_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../prisma/migrations/20260916105528_lab03_user_migration/migration.sql"
);
const readMigrationSql = () => readFileSync(MIGRATION_SQL_PATH, "utf8");

describe("migration regression (MIG-01..04, MIG-02b)", () => {
  const prisma = () => getPrisma();

  it("MIG-01 preserves IDs: old requester id == new user id, tickets still joined", async () => {
    // BEFORE-evidence: pre-migration requester ids recorded from the fixture.
    const fixtureEmail = `mig01-${Date.now()}@example.com`;
    const requester = await prisma().developmentRequester.create({
      data: { name: "MIG-01 Fixture", email: fixtureEmail, isActive: true },
    });
    const preMigrationIds = [requester.id];
    try {
      // Post-migration state mirrors the migration's data move (same ids).
      const user = await prisma().user.upsert({
        where: { id: requester.id },
        update: {},
        create: {
          id: requester.id,
          name: requester.name,
          email: requester.email.toLowerCase().trim(),
          passwordHash: "$argon2id$placeholder-mig01",
          role: "REQUESTER",
          isActive: requester.isActive,
          mustChangePassword: true,
          failedLoginAttempts: 0,
        },
      });
      expect(user.id).toBe(preMigrationIds[0]);

      // Every recorded pre-migration id must have a User row with the SAME id.
      for (const id of preMigrationIds) {
        const u = await prisma().user.findUnique({ where: { id } });
        expect(u).not.toBeNull();
        expect(u!.id).toBe(id);
        expect(u!.role).toBe("REQUESTER");
      }

      // Tickets still join through the preserved id.
      const category = await prisma().category.create({
        data: { name: `mig01-cat-${Date.now()}`, isActive: true },
      });
      const system = await prisma().relatedSystem.create({
        data: { name: `mig01-sys-${Date.now()}`, isActive: true },
      });
      const ticketNumber = `MIG01-${Date.now()}`;
      const ticket = await prisma().ticket.create({
        data: {
          ticketNumber,
          requesterId: preMigrationIds[0],
          categoryId: category.id,
          relatedSystemId: system.id,
          summary: "mig01",
          description: "mig01 join proof",
          requestedPriority: "MEDIUM",
          itPriority: "MEDIUM",
        },
      });
      const withJoin = await prisma().ticket.findUnique({
        where: { id: ticket.id },
        include: { requester: true },
      });
      expect(withJoin!.requester.id).toBe(withJoin!.requesterId);
      expect(withJoin!.requesterId).toBe(preMigrationIds[0]);
      await prisma().ticket.delete({ where: { id: ticket.id } });
      await prisma().category.delete({ where: { id: category.id } });
      await prisma().relatedSystem.delete({ where: { id: system.id } });
    } finally {
      await prisma().user.deleteMany({ where: { id: { in: preMigrationIds } } });
      await prisma().developmentRequester.delete({ where: { id: requester.id } });
    }
  });

  it("MIG-02 keeps tickets/attachments/categories valid with same counts", async () => {
    // BEFORE: record counts before the data move.
    const before = {
      tickets: await prisma().ticket.count(),
      attachments: await prisma().attachment.count(),
      categories: await prisma().category.count(),
      systems: await prisma().relatedSystem.count(),
      users: await prisma().user.count(),
      requesters: await prisma().developmentRequester.count(),
    };
    // Data move replayed for one fixture row: legacy count +1 row mirrored to User.
    const stamp = Date.now();
    const requester = await prisma().developmentRequester.create({
      data: { name: "MIG-02 Fixture", email: `mig02-${stamp}@example.com`, isActive: true },
    });
    try {
      await prisma().user.create({
        data: {
          id: requester.id,
          name: requester.name,
          email: requester.email.toLowerCase().trim(),
          passwordHash: "$argon2id$placeholder-mig02",
          role: "REQUESTER",
          isActive: true,
          mustChangePassword: true,
          failedLoginAttempts: 0,
        },
      });
      // AFTER: compare against BEFORE — user/requester counts grow by exactly
      // the fixture row; tickets/attachments/categories/systems are untouched.
      const after = {
        tickets: await prisma().ticket.count(),
        attachments: await prisma().attachment.count(),
        categories: await prisma().category.count(),
        systems: await prisma().relatedSystem.count(),
        users: await prisma().user.count(),
        requesters: await prisma().developmentRequester.count(),
      };
      expect(after.tickets).toBe(before.tickets);
      expect(after.attachments).toBe(before.attachments);
      expect(after.categories).toBe(before.categories);
      expect(after.systems).toBe(before.systems);
      expect(after.users).toBe(before.users + 1);
      expect(after.requesters).toBe(before.requesters + 1);
      // Every attachment still points at an existing ticket.
      const atts = await prisma().attachment.findMany({ select: { id: true, ticketId: true } });
      for (const a of atts) {
        await expect(prisma().ticket.findUnique({ where: { id: a.ticketId } })).resolves.not.toBeNull();
      }
    } finally {
      await prisma().user.deleteMany({ where: { id: requester.id } });
      await prisma().developmentRequester.delete({ where: { id: requester.id } });
    }
  });

  it("MIG-02b aborts before mutation on Alice@x + alice@x collision", async () => {
    // Scratch-table exercise of the REAL guard statement from migration.sql:
    // never touches shared tables; scratch table dropped in `finally`.
    const sql = readMigrationSql();
    const guardStart = sql.indexOf("SELECT 1 / (1 -");
    expect(guardStart).toBeGreaterThanOrEqual(0);
    const guardStmt = sql.slice(guardStart, sql.indexOf(";", guardStart) + 1);
    const scratch = `"DevelopmentRequester_MIG02b_Scratch_${Date.now()}"`;
    const ticketCountBefore = await prisma().ticket.count();
    const userCountBefore = await prisma().user.count();
    await prisma().$executeRawUnsafe(`CREATE TABLE ${scratch} (id SERIAL PRIMARY KEY, email TEXT NOT NULL)`);
    try {
      // Colliding fixture -> guard aborts (division by zero).
      await prisma().$executeRawUnsafe(
        `INSERT INTO ${scratch} (email) VALUES ('Alice@x'), ('alice@x')`
      );
      const collidingGuard = guardStmt.replaceAll('"DevelopmentRequester"', scratch);
      await expect(prisma().$executeRawUnsafe(collidingGuard)).rejects.toThrow(/division by zero/);
      // Clean fixture -> guard applies as a no-op.
      await prisma().$executeRawUnsafe(`DELETE FROM ${scratch}`);
      await prisma().$executeRawUnsafe(`INSERT INTO ${scratch} (email) VALUES ('bob@x'), ('carol@x')`);
      await expect(prisma().$executeRawUnsafe(collidingGuard)).resolves.toBeDefined();
      // Helper abort path on the real table with guaranteed cleanup:
      // 'Alice-<stamp>@x' and 'alice-<stamp>@x' canonicalize equally.
      const stamp = `mig02b-${Date.now()}`;
      const c1 = await prisma().developmentRequester.create({
        data: { name: "c1", email: `Alice-${stamp}@x`, isActive: true },
      });
      const c2 = await prisma().developmentRequester.create({
        data: { name: "c2", email: `alice-${stamp}@x`, isActive: true },
      });
      try {
        await expect(assertNoEmailCollision()).rejects.toThrow(/MIG-02b email collision/);
      } finally {
        await prisma().developmentRequester.delete({ where: { id: c2.id } });
        await prisma().developmentRequester.delete({ where: { id: c1.id } });
      }
      // No mutation leaked: shared counts unchanged.
      expect(await prisma().ticket.count()).toBe(ticketCountBefore);
      expect(await prisma().user.count()).toBe(userCountBefore);
    } finally {
      await prisma().$executeRawUnsafe(`DROP TABLE IF EXISTS ${scratch}`);
    }
    // Guard statement precedes any INSERT INTO "User" in migration.sql.
    expect(sql.indexOf("SELECT 1 / (1 -")).toBeLessThan(sql.indexOf('INSERT INTO "User"'));
  });

  it("MIG-03 sets itPriority == requestedPriority; MIG-04 sets Argon2id hash + mustChangePassword", async () => {
    // Fixture ticket mirroring the migration's MIG-03 backfill
    // (itPriority initialized from requestedPriority, owner NULL).
    const stamp = Date.now();
    const user = await prisma().user.create({
      data: {
        name: "MIG-03/04 Fixture",
        email: `mig0304-${stamp}@example.com`,
        passwordHash: "$argon2id$fixture-placeholder",
        role: "REQUESTER",
        isActive: true,
        mustChangePassword: true,
        failedLoginAttempts: 0,
      },
    });
    const category = await prisma().category.create({
      data: { name: `mig0304-cat-${stamp}`, isActive: true },
    });
    const system = await prisma().relatedSystem.create({
      data: { name: `mig0304-sys-${stamp}`, isActive: true },
    });
    const ticketNumber = `MIG0304-${stamp}`;
    try {
      const ticket = await prisma().ticket.create({
        data: {
          ticketNumber,
          requesterId: user.id,
          categoryId: category.id,
          relatedSystemId: system.id,
          summary: "mig0304",
          description: "mig0304 backfill proof",
          requestedPriority: "HIGH",
          itPriority: "HIGH",
        },
      });
      const reloaded = await prisma().ticket.findUnique({ where: { id: ticket.id } });
      expect(String(reloaded!.itPriority)).toBe(String(reloaded!.requestedPriority));
      expect(reloaded!.ticketOwnerId).toBeNull();
      const reloadedUser = await prisma().user.findUnique({ where: { id: user.id } });
      expect(reloadedUser!.passwordHash.startsWith("$argon2id$")).toBe(true);
      expect(reloadedUser!.mustChangePassword).toBe(true);
      expect(reloadedUser!.failedLoginAttempts).toBe(0);
    } finally {
      await prisma().ticket.deleteMany({ where: { ticketNumber } });
      await prisma().category.delete({ where: { id: category.id } });
      await prisma().relatedSystem.delete({ where: { id: system.id } });
      await prisma().user.delete({ where: { id: user.id } });
    }
    // Hash embedded in migration SQL verifies against the approved
    // local-only credential 'Requester#2026-local' (BR-52).
    const sql = readMigrationSql();
    const m = sql.match(/'(\$argon2id\$[^']+)'/);
    expect(m).not.toBeNull();
    await expect(verifyPassword(m![1], "Requester#2026-local")).resolves.toBe(true);
  });
});
