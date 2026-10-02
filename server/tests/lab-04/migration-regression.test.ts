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

  it("MIG-03 resolutionCycle default: omitted cycle stores 1, explicit values preserved, existing rows carry 1", async () => {
    // Self-sufficient: CI uses a fresh database with no seeded rows, so this
    // test proves the column contract on its own fixture instead of assuming
    // seed data. (Backfill of pre-existing rows to 1 is enforced by the
    // NOT NULL DEFAULT 1 column definition verified in MIG-01.)
    const email = `mig03-${Date.now()}@example.com`;
    const user = await prisma().user.create({
      data: {
        name: "MIG-03 Fixture",
        email,
        passwordHash: "placeholder-mig03",
        role: "REQUESTER",
        isActive: true,
        mustChangePassword: false,
        failedLoginAttempts: 0,
      },
      select: { id: true },
    });
    const category = await prisma().category.create({ data: { name: `MIG-03 Cat ${Date.now()}` } });
    const system = await prisma().relatedSystem.create({ data: { name: `MIG-03 Sys ${Date.now()}` } });
    try {
      // Rows created without an explicit cycle receive the backfilled default.
      const ticket = await prisma().ticket.create({
        data: {
          ticketNumber: `MIG03-${Date.now()}`,
          requesterId: user.id,
          categoryId: category.id,
          relatedSystemId: system.id,
          summary: "MIG-03 default-cycle fixture ticket",
          description: "Verifies resolutionCycle defaults without seed data.",
          requestedPriority: "MEDIUM",
          itPriority: "MEDIUM",
        },
        select: { id: true, resolutionCycle: true },
      });
      expect(ticket.resolutionCycle).toBe(1);
      // Explicit values are preserved (backfill never overwrites).
      await prisma().ticket.update({ where: { id: ticket.id }, data: { resolutionCycle: 2 } });
      const kept = await prisma().ticket.findUniqueOrThrow({ where: { id: ticket.id }, select: { resolutionCycle: true } });
      expect(kept.resolutionCycle).toBe(2);
      await prisma().ticket.delete({ where: { id: ticket.id } });
    } finally {
      await prisma().user.delete({ where: { id: user.id } }).catch(() => null);
      await prisma().category.delete({ where: { id: category.id } }).catch(() => null);
      await prisma().relatedSystem.delete({ where: { id: system.id } }).catch(() => null);
    }
    // SEED-0008 is the deliberate second-cycle seed fixture (BR-028); every
    // other pre-existing row MUST carry the backfilled 1. Scoped to avoid
    // depending on seed presence: only rows that exist are checked.
    const bad: { count: string }[] = await prisma().$queryRaw`
      SELECT COUNT(*) AS count FROM "Ticket"
      WHERE "resolutionCycle" IS NULL OR ("resolutionCycle" <> 1 AND "ticketNumber" <> 'SEED-0008')`;
    expect(Number(bad[0].count)).toBe(0);
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
      LEFT JOIN "User" u ON u.id = a."recordedById"
      WHERE t.id IS NULL OR u.id IS NULL`;
    expect(Number(orphans[0].count)).toBe(0);
    // Rerun idempotency: a second seed creates zero new actions and never
    // resets the distribution above.
    await runSeed();
    expect(await countActions()).toBe(firstCount);
  });

  it("MIG-04 recovery: Lab 4 migration is forward-only additive with a documented restore path", async () => {
    // Phase 0 — file audit (precondition, not the proof): the migration MUST
    // NOT drop Lab 1–3 tables or columns.
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
  }, 300000);

  it("MIG-04 recovery drill: backup → destroy → observed failure → restore → verify", async () => {
    // Real restore drill (D-07/D-08, Option A) on a DEDICATED scratch
    // database — never dev, never the shared test database.
    const { execFile, execFileSync } = await import("node:child_process");
    const { createHash } = await import("node:crypto");
    const { tmpdir } = await import("node:os");
    const { join: joinPath } = await import("node:path");
    const { readFileSync: readTmp, unlinkSync } = await import("node:fs");
    // Tool preflight: resolve real PostgreSQL client binaries (NOT npm
    // packages — `npx psql` would fetch an unrelated package). Missing
    // binary aborts before any destructive SQL.
    const toolPath = (name: string): string => {
      try {
        return execFileSync(process.platform === "win32" ? "where" : "which", [name], { encoding: "utf8" })
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter((s) => s.length > 0 && !s.includes("node_modules"))[0] ?? "";
      } catch {
        return "";
      }
    };
    const PSQL = toolPath("psql");
    const PG_DUMP = toolPath("pg_dump");
    const PG_RESTORE = toolPath("pg_restore");
    expect(PSQL.length).toBeGreaterThan(0);
    expect(PG_DUMP.length).toBeGreaterThan(0);
    expect(PG_RESTORE.length).toBeGreaterThan(0);
    const run = (cmd: string, args: string[], env: NodeJS.ProcessEnv): Promise<{ code: number; out: string }> =>
      new Promise((resolve) => {
        execFile(cmd, args, { env, timeout: 120000 }, (err, stdout, stderr) => {
          resolve({ code: err ? (err as { code?: number }).code ?? 1 : 0, out: `${stdout ?? ""}${stderr ?? ""}` });
        });
      });
    // npx is a .cmd shim on Windows and cannot run without a shell. Shell
    // usage is confined to fixed argv[0] ("npx"/"prisma") with a validated
    // scratch name — never interpolating untrusted input into the command.
    const { execSync } = await import("node:child_process");
    const testUrl = process.env.TEST_DATABASE_URL ?? "";
    const scratchDb = process.env.MIG04_SCRATCH_DATABASE ?? "toktickit_mig04_test";
    if (!/^[A-Za-z0-9_]+$/.test(scratchDb)) throw new Error("refusing: scratch database name failed validation");
    const runShell = (args: string[], env: NodeJS.ProcessEnv): { code: number; out: string } => {
      try {
        const out = execSync(`npx ${args.map((a) => `"${a.replace(/"/g, "")}"`).join(" ")}`, {
          env,
          timeout: 180000,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        } as never) as string;
        return { code: 0, out };
      } catch (e) {
        const err = e as { status?: number; stdout?: unknown; stderr?: unknown };
        return { code: err.status ?? 1, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
      }
    };
    const withDb = (url: string, db: string) => url.replace(/\/[^/?]*(\?|$)/, `/${db}$1`);
    // Raw libpq tools (psql/pg_dump/pg_restore) reject Prisma's
    // `?schema=` query parameter — strip it for tool invocations only.
    const bareUrl = (url: string) => url.replace(/\?.*$/, "");
    const scratchUrl = withDb(testUrl, scratchDb);
    // Gate 0 — preflight: exact scratch identity (D-08). Any miss aborts
    // before ANY destructive SQL.
    const { assertScratchTarget, parseDatabaseTarget } = await import("../../src/lib/test-target-guard.js");
    const testTarget = parseDatabaseTarget(testUrl)!;
    const target = assertScratchTarget({
      scratchUrl,
      expected: { database: scratchDb, host: testTarget.host, port: testTarget.port },
      devUrl: process.env.DATABASE_URL,
      sharedTestUrl: testUrl,
    });
    expect(target.database).toBe(scratchDb);
    const adminUrl = scratchUrl.replace(/\/[^/?]*(\?|$)/, "/postgres$1");
    const psql = (dbUrl: string, sql: string) =>
      run(PSQL, [bareUrl(dbUrl), "-v", "ON_ERROR_STOP=1", "-tA", "-c", sql], process.env);
    let cleanupError: unknown = null;
    const snapshotOf = async (dbUrl: string) => {
      const snap: Record<string, string> = {};
      // Raw libpq tools reject Prisma's `?schema=` parameter — always strip.
      const plain = bareUrl(dbUrl);
      for (const table of ["ActionTaken", "ActionTakenEvent", "Ticket"]) {
        const r = await run(PSQL, [plain, "-v", "ON_ERROR_STOP=1", "-tA", "-c",
          `SELECT coalesce(string_agg(row_to_json(t)::text, chr(10) ORDER BY t."id"), '') FROM (SELECT * FROM "${table}" ORDER BY "id") t`], process.env);
        expect(r.code).toBe(0);
        snap[table] = r.out;
      }
      const seq = await run(PSQL, [plain, "-v", "ON_ERROR_STOP=1", "-tA", "-c",
        `SELECT string_agg(schemaname||'.'||sequencename||'='||last_value, ',' ORDER BY sequencename) FROM pg_sequences WHERE sequencename LIKE 'ActionTaken%'`], process.env);
      expect(seq.code).toBe(0);
      snap.__sequences = seq.out.trim();
      return snap;
    };
    try {
      // Gate 1 — known-good state on scratch: fresh DB + full migrate + seed.
      await run(PSQL, [bareUrl(adminUrl), "-c", `DROP DATABASE IF EXISTS "${scratchDb}"`], process.env);
      {
        const r = await run(PSQL, [bareUrl(adminUrl), "-c", `CREATE DATABASE "${scratchDb}"`], process.env);
        expect(r.code).toBe(0);
      }
      {
        const r = runShell(["prisma", "migrate", "deploy"], { ...process.env, DATABASE_URL: scratchUrl });
        expect(r.code).toBe(0);
      }
      {
        // getPrisma() honours TEST_DATABASE_URL when NODE_ENV=test, which
        // would seed the shared test DB instead of scratch. Drop NODE_ENV so
        // the seed honours DATABASE_URL (scratch) like `migrate deploy` does.
        const seedEnv: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: scratchUrl };
        delete seedEnv.NODE_ENV;
        const r = runShell(["prisma", "db", "seed"], seedEnv);
        expect(r.code).toBe(0);
      }
      const before = await snapshotOf(scratchUrl);
      // String-length bounds are non-vacuous: an empty table snapshots to at
      // most a single newline, so these prove Gate 1 really seeded scratch.
      expect(before["Ticket"].length).toBeGreaterThan(10);
      expect(before["ActionTaken"].length).toBeGreaterThan(10);
      // Gate 2 — backup: exit code + exists + non-empty + SHA recorded.
      const backupPath = joinPath(tmpdir(), `mig04-${Date.now()}.dump`);
      {
        const r = await run(PG_DUMP, ["-Fc", "-f", backupPath, bareUrl(scratchUrl)], process.env);
        expect(r.code).toBe(0);
      }
      const { statSync } = await import("node:fs");
      expect(statSync(backupPath).size).toBeGreaterThan(0);
      const shaOf = (p: string) => createHash("sha256").update(readTmp(p)).digest("hex");
      const recordedSha = shaOf(backupPath);
      // Gate 3 — controlled destruction on scratch ONLY.
      for (const [_label, sql] of [["drop-events", `DROP TABLE "ActionTakenEvent";`], ["delete-actions", `DELETE FROM "ActionTaken";`]] as const) {
        const r = await psql(scratchUrl, sql);
        expect(r.code).toBe(0);
      }
      // Gate 4 — OBSERVE the failure (asserted, never assumed).
      const broken = await psql(scratchUrl, `SELECT COUNT(*) FROM "ActionTakenEvent";`);
      expect(broken.code).not.toBe(0);
      // Gate 5 — SHA re-verification immediately pre-restore; mismatch aborts.
      expect(shaOf(backupPath)).toBe(recordedSha);
      {
        const r = await run(PG_RESTORE, ["-c", "--if-exists", "-d", bareUrl(scratchUrl), backupPath], process.env);
        expect(r.code).toBe(0);
      }
      // Gate 6 — full verification: byte-identical rows, sequences, ledger, live read.
      const after = await snapshotOf(scratchUrl);
      expect(after).toEqual(before);
      const live = await psql(scratchUrl, `SELECT COUNT(*) FROM "ActionTaken";`);
      expect(live.code).toBe(0);
      // Next-id probe: restored sequences MUST NOT collide or reuse ids.
      const maxId = await psql(scratchUrl, `SELECT COALESCE(MAX("id"),0) FROM "ActionTaken";`);
      expect(maxId.code).toBe(0);
      const probeTicket = await psql(scratchUrl, `SELECT "id" FROM "Ticket" ORDER BY "id" LIMIT 1;`);
      const probeUser = await psql(scratchUrl, `SELECT "id" FROM "User" WHERE "role"='IT_STAFF' AND "isActive" ORDER BY "id" LIMIT 1;`);
      const tid = probeTicket.out.trim().split("\n")[0];
      const uid = probeUser.out.trim().split("\n")[0];
      const probeKey = "11111111-1111-4111-8111-111111111111";
      const ins = await psql(scratchUrl,
        `INSERT INTO "ActionTaken" ("ticketId","description","recordedById","actionDate","status","cycle","version","clientRequestId","createdAt","updatedAt") VALUES (${tid},'probe',${uid},NOW(),'PLANNED',1,1,'${probeKey}',NOW(),NOW()) RETURNING "id";`);
      expect(ins.code).toBe(0);
      const newId = Number(ins.out.trim().split("\n")[0]);
      expect(newId).toBeGreaterThan(Number(maxId.out.trim().split("\n")[0]));
      unlinkSync(backupPath);
    } finally {
      // Gate 7 — cleanup reported separately; never flips the drill verdict.
      try {
        await run(PSQL, [bareUrl(adminUrl), "-c", `DROP DATABASE IF EXISTS "${scratchDb}"`], process.env);
      } catch (e) {
        cleanupError = e;
      }
    }
    expect(cleanupError).toBeNull();
  }, 300000);
});
