import { describe, it, expect } from "vitest";
import {
  parseDatabaseTarget,
  isTestLikeTarget,
  isSameTarget,
  assertTestTarget,
  assertScratchTarget,
} from "../test-target-guard.js";

// Issue #57 — fail-closed dev/test database separation guard: no
// DB-writing path may silently fall back to the development database when
// test config is missing or invalid.
const DEV = "postgresql://toktickit:toktickit@localhost:5432/toktickit?schema=public";
const TEST = "postgresql://toktickit:toktickit@localhost:5432/toktickit_test?schema=public";

describe("test-target guard (Issue #57)", () => {
  it("parses canonical targets without ever exposing credentials", () => {
    const t = parseDatabaseTarget(TEST);
    expect(t).toMatchObject({ host: "localhost", port: 5432, database: "toktickit_test", schema: "public" });
    expect(JSON.stringify(t)).not.toContain("toktickit:toktickit");
    expect(JSON.stringify(assertTestTarget({ testUrl: TEST, devUrl: DEV }))).not.toContain("toktickit:toktickit");
  });

  it("rejects missing, empty, and whitespace test URLs", () => {
    for (const bad of [undefined, "", "   "]) {
      expect(() => assertTestTarget({ testUrl: bad, devUrl: DEV })).toThrow(/TEST_DATABASE_URL/i);
    }
  });

  it("rejects unparsable and non-PostgreSQL test URLs", () => {
    for (const bad of ["not-a-url", "mysql://u:p@localhost:3306/toktickit_test", "http://localhost/db"]) {
      expect(() => assertTestTarget({ testUrl: bad, devUrl: DEV })).toThrow();
    }
  });

  it("rejects test URLs whose database is not test-like", () => {
    expect(isTestLikeTarget(parseDatabaseTarget(TEST)!)).toBe(true);
    expect(isTestLikeTarget(parseDatabaseTarget(DEV)!)).toBe(false);
    expect(() => assertTestTarget({ testUrl: DEV, devUrl: DEV })).toThrow(/test/i);
  });

  it("rejects a test target identical to a development database", () => {
    expect(isSameTarget(parseDatabaseTarget(TEST)!, parseDatabaseTarget(TEST)!)).toBe(true);
    expect(isSameTarget(parseDatabaseTarget(TEST)!, parseDatabaseTarget(DEV)!)).toBe(false);
    // Same-target as a NON-TEST dev database would write dev data.
    expect(() => assertTestTarget({ testUrl: DEV, devUrl: DEV })).toThrow();
  });

  it("accepts a shared test target (CI sets both vars to the test DB)", () => {
    // CI points DATABASE_URL at the test database too; same-target is
    // only dangerous against a development database.
    expect(() => assertTestTarget({ testUrl: TEST, devUrl: TEST })).not.toThrow();
  });

  it("accepts valid distinct dev/test targets and reports safely", () => {
    const t = assertTestTarget({ testUrl: TEST, devUrl: DEV });
    expect(t).toMatchObject({ database: "toktickit_test" });
  });

  it("never includes credentials in thrown messages", () => {
    const attempts: Array<{ testUrl: string | undefined; devUrl?: string | undefined }> = [
      { testUrl: undefined, devUrl: DEV },
      { testUrl: "mysql://admin:s3cret@db:3306/toktickit_test", devUrl: DEV },
      { testUrl: "postgresql://admin:s3cret@db:5432/toktickit", devUrl: DEV },
    ];
    for (const env of attempts) {
      try {
        assertTestTarget(env);
        expect.unreachable();
      } catch (err) {
        expect((err as Error).message).not.toContain("s3cret");
        expect((err as Error).message).not.toContain("admin:s3cret");
      }
    }
  });
});

// Lab 4 (Issue #77, D-08) — exact scratch-target identity gate for
// destructive drills. The shared guard accepts any test-like name, so this
// gate must additionally pin the exact expected identity.
const SCRATCH = "postgresql://toktickit:toktickit@localhost:5432/toktickit_mig04_test?schema=public";
const SHARED_TEST = "postgresql://toktickit:toktickit@localhost:5432/toktickit_test?schema=public";
const EXPECTED = { database: "toktickit_mig04_test", host: "localhost", port: 5432 };

describe("scratch target identity gate (Issue #77, D-08)", () => {
  const base = { devUrl: DEV, sharedTestUrl: SHARED_TEST };

  it("accepts the exact expected scratch target", () => {
    const t = assertScratchTarget({ scratchUrl: SCRATCH, expected: EXPECTED, ...base });
    expect(t).toMatchObject({ database: "toktickit_mig04_test", host: "localhost", port: 5432 });
  });

  it("rejects missing, empty, unparsable, and non-test-like scratch URLs", () => {
    for (const bad of [undefined, "", "   ", "not-a-url", "mysql://u:p@localhost:3306/toktickit_mig04_test"]) {
      expect(() => assertScratchTarget({ scratchUrl: bad, expected: EXPECTED, ...base })).toThrow();
    }
    expect(() =>
      assertScratchTarget({ scratchUrl: "postgresql://u:p@localhost:5432/appdb", expected: { ...EXPECTED, database: "appdb" }, ...base }),
    ).toThrow(/test/i);
  });

  it("rejects a test-like database that is not the expected scratch name", () => {
    // This is the core gap: name-includes-test alone would accept it.
    expect(() =>
      assertScratchTarget({ scratchUrl: SHARED_TEST, expected: EXPECTED, ...base }),
    ).toThrow(/toktickit_test/);
  });

  it("rejects identical-to-dev and identical-to-shared-test targets", () => {
    const devLike = { database: "toktickit_mig04_test", host: "localhost", port: 5432 };
    expect(() =>
      assertScratchTarget({
        scratchUrl: "postgresql://toktickit:toktickit@localhost:5432/toktickit_mig04_test?schema=public",
        expected: devLike,
        devUrl: "postgresql://toktickit:toktickit@localhost:5432/toktickit_mig04_test?schema=public",
      }),
    ).toThrow(/development/i);
    expect(() =>
      assertScratchTarget({ scratchUrl: SHARED_TEST, expected: { database: "toktickit_test", host: "localhost", port: 5432 }, devUrl: DEV, sharedTestUrl: SHARED_TEST }),
    ).toThrow(/shared test/i);
  });

  it("rejects wrong host or port even when the name matches", () => {
    expect(() =>
      assertScratchTarget({
        scratchUrl: "postgresql://toktickit:toktickit@db.internal:5432/toktickit_mig04_test?schema=public",
        expected: EXPECTED,
        ...base,
      }),
    ).toThrow(/host/i);
    expect(() =>
      assertScratchTarget({
        scratchUrl: "postgresql://toktickit:toktickit@localhost:5433/toktickit_mig04_test?schema=public",
        expected: EXPECTED,
        ...base,
      }),
    ).toThrow(/host|port/i);
  });

  it("never includes credentials in thrown messages", () => {
    try {
      assertScratchTarget({
        scratchUrl: "postgresql://admin:s3cret@db:5432/nope?schema=public",
        expected: EXPECTED,
        devUrl: DEV,
      });
      expect.unreachable();
    } catch (err) {
      expect((err as Error).message).not.toContain("s3cret");
    }
  });
});
