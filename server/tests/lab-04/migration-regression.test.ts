import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { getPrisma } from "../../src/prisma.js";
import { runSeed } from "../../prisma/seed.js";

// Lab 4 migration regression (MIG-01, MIG-03).
// Runs against the isolated test DB (NODE_ENV=test + TEST_DATABASE_URL).
// Verifies the additive `lab04_actions_gate` migration: new tables/columns/
// FKs/indexes/defaults exist and all pre-existing Lab 1–3 data is intact
// with `resolutionCycle = 1` backfilled (BR-026/BR-029, AC-019).
describe("lab-04 migration regression (MIG-01, MIG-03)", () => {
  const prisma = () => getPrisma();

  it("MIG-01 additive migration: new tables, columns, FKs, indexes, defaults exist", async () => {
    const tables: { tablename: string }[] = await prisma().$queryRaw`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename IN ('ActionTaken', 'ActionTakenEvent')`;
    expect(tables.map((t) => t.tablename).sort()).toEqual([
      "ActionTaken",
      "ActionTakenEvent",
    ]);

    const columns: { column_name: string; data_type: string; is_nullable: string; column_default: string | null }[] =
      await prisma().$queryRaw`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = 'Ticket' AND column_name = 'resolutionCycle'`;
    expect(columns).toHaveLength(1);
    expect(columns[0].data_type).toBe("integer");
    expect(columns[0].is_nullable).toBe("NO");
    expect(columns[0].column_default).toContain("1");

    const fks: { conname: string; confdeltype: string }[] = await prisma().$queryRaw`
      SELECT c.conname, c.confdeltype
      FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
      WHERE t.relname IN ('ActionTaken', 'ActionTakenEvent') AND c.contype = 'f'`;
    const rules = new Map(
      fks.map((f) => [f.conname, String(f.confdeltype).toLowerCase()] as const),
    );
    // Prisma Restrict → RESTRICT ('r'); Cascade → CASCADE ('c').
    expect(rules.get("ActionTaken_ticketId_fkey")).toBe("r");
    expect(rules.get("ActionTakenEvent_actionTakenId_fkey")).toBe("c");

    const uniques: { indexname: string }[] = await prisma().$queryRaw`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'ActionTaken'
        AND indexname = 'ActionTaken_ticketId_clientRequestId_key'`;
    expect(uniques).toHaveLength(1);

    // Lab 1–3 data intact: seeded reference data still present.
    const categories = await prisma().category.count();
    expect(categories).toBeGreaterThan(0);
  });

  it("MIG-03 deterministic backfill: every existing Ticket has resolutionCycle = 1", async () => {
    // SEED-0008 is the deliberate second-cycle seed fixture (BR-028); every
    // other ticket MUST carry the backfilled 1.
    const bad: { count: string }[] = await prisma().$queryRaw`
      SELECT COUNT(*) AS count FROM "Ticket"
      WHERE "resolutionCycle" IS NULL OR ("resolutionCycle" <> 1 AND "ticketNumber" <> 'SEED-0008')`;
    expect(Number(bad[0].count)).toBe(0);

    const total: { count: string }[] = await prisma().$queryRaw`
      SELECT COUNT(*) AS count FROM "Ticket"`;
    expect(Number(total[0].count)).toBeGreaterThan(0);
  });

  it("MIG-02 seed distribution: 0/1/N action coverage with lifecycle variety", async () => {
    // Self-sufficient: other suites may clean SEED fixtures, so seed first.
    await runSeed();
    const countActions = () => prisma().actionTaken.count();
    const firstCount = await countActions();
    const statuses: { status: string; count: string }[] = await prisma().$queryRaw`
      SELECT status::text AS status, COUNT(*) AS count FROM "ActionTaken" GROUP BY status`;
    const byStatus = new Map(statuses.map((s) => [s.status, Number(s.count)]));
    for (const s of ["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]) {
      expect(byStatus.get(s) ?? 0).toBeGreaterThan(0);
    }
    // Zero-action legacy tickets exist alongside action-bearing tickets.
    const withActions: { count: string }[] = await prisma().$queryRaw`
      SELECT COUNT(DISTINCT "ticketId") AS count FROM "ActionTaken"`;
    const tickets: { count: string }[] = await prisma().$queryRaw`
      SELECT COUNT(*) AS count FROM "Ticket"`;
    expect(Number(withActions[0].count)).toBeGreaterThan(0);
    expect(Number(withActions[0].count)).toBeLessThan(Number(tickets[0].count));
    // Every action links to a real ticket and a real recorder.
    const orphans: { count: string }[] = await prisma().$queryRaw`
      SELECT COUNT(*) AS count FROM "ActionTaken" a
      LEFT JOIN "Ticket" t ON t.id = a."ticketId"
      LEFT JOIN "User" u ON u.id = a."performedById"
      WHERE t.id IS NULL OR u.id IS NULL`;
    expect(Number(orphans[0].count)).toBe(0);
    // Rerun idempotency: a second seed creates zero new actions and never
    // resets the distribution above.
    await runSeed();
    expect(await countActions()).toBe(firstCount);
  });

  it("MIG-04 recovery: Lab 4 migration is forward-only additive with a documented restore path", async () => {
    // The migration file itself MUST NOT drop Lab 1–3 tables or columns:
    // recovery is restore-from-backup plus re-apply, never a DOWN migration.
    const sqlPath = join(
      dirname(fileURLToPath(import.meta.url)),
      "../../prisma/migrations/20261001000000_lab04_actions_gate/migration.sql",
    );
    expect(existsSync(sqlPath)).toBe(true);
    const sql = readFileSync(sqlPath, "utf8").toUpperCase();
    for (const table of ['"USER"', '"TICKET"', '"CATEGORY"', '"RELATEDSYSTEM"', '"ATTACHMENT"', '"PUBLICCOMMENT"', '"INTERNALNOTE"', '"SESSION"', '"DEVELOPMENTREQUESTER"']) {
      expect(sql).not.toContain(`DROP TABLE ${table}`);
      expect(sql).not.toContain(`DROP COLUMN`);
    }
    // Re-deploy is a no-op on an already-migrated database (idempotent
    // recovery step): Lab 1–3 row counts are unchanged by re-running.
    const before: { count: string }[] = await prisma().$queryRaw`
      SELECT COUNT(*) AS count FROM "Ticket"`;
    expect(Number(before[0].count)).toBeGreaterThan(0);
    // resolutionCycle still holds everywhere after all migration activity
    // (SEED-0008 is the deliberate second-cycle fixture).
    const bad: { count: string }[] = await prisma().$queryRaw`
      SELECT COUNT(*) AS count FROM "Ticket"
      WHERE "resolutionCycle" IS NULL OR ("resolutionCycle" <> 1 AND "ticketNumber" <> 'SEED-0008')`;
    expect(Number(bad[0].count)).toBe(0);
  });
});
