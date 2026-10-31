// Issue #57 — fail-closed development/test database separation guard.
//
// No DB-writing path may silently fall back to the development database
// when test config is missing or invalid. Rules (fail-closed, first match
// wins):
//
// 1. Missing/empty TEST_DATABASE_URL → throw (never fall back).
// 2. Unparsable or non-PostgreSQL test URL → throw.
// 3. Test URL whose database name is not test-like (no "test" segment) →
//    throw. ("Test-like" is a name heuristic, documented here and in
//    `.env.example`; it is intentionally conservative.)
// 4. Test target identical to a NON-TEST development target → throw (that
//    would write test fixtures into development data). A shared TEST target
//    (CI points both vars at the test DB) is accepted — there is no
//    development database in that configuration to protect.
//
// Credentials never appear in parsed output or thrown messages: only
// host/port/database/schema travel, and errors describe the rule that
// failed, never the URL.

export interface DatabaseTarget {
  host: string;
  port: number;
  database: string;
  schema: string;
}

export function parseDatabaseTarget(url: string | undefined): DatabaseTarget | null {
  if (typeof url !== "string") return null;
  const trimmed = url.trim();
  if (trimmed.length === 0) return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") return null;
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!database) return null;
  const port = parsed.port === "" ? 5432 : Number(parsed.port);
  if (!Number.isInteger(port) || port <= 0) return null;
  return {
    host: parsed.hostname.toLowerCase(),
    port,
    database,
    schema: parsed.searchParams.get("schema") ?? "public",
  };
}

export function isTestLikeTarget(target: DatabaseTarget | null): boolean {
  if (!target) return false;
  return target.database.toLowerCase().includes("test");
}

export function isSameTarget(a: DatabaseTarget | null, b: DatabaseTarget | null): boolean {
  if (!a || !b) return false;
  return a.host === b.host && a.port === b.port && a.database === b.database && a.schema === b.schema;
}

export function assertTestTarget(env: {
  testUrl: string | undefined;
  devUrl?: string | undefined;
}): DatabaseTarget {
  const raw = typeof env.testUrl === "string" ? env.testUrl.trim() : "";
  if (raw.length === 0) {
    throw new Error(
      "TEST_DATABASE_URL is not set. Refusing to run against the development database. " +
        "Create a dedicated test database and set TEST_DATABASE_URL (see server/.env.example)."
    );
  }
  const target = parseDatabaseTarget(raw);
  if (!target) {
    throw new Error("TEST_DATABASE_URL is not a valid PostgreSQL connection URL. Refusing to run.");
  }
  if (!isTestLikeTarget(target)) {
    throw new Error(
      `TEST_DATABASE_URL database "${target.database}" does not look like a test database. Refusing to run.`
    );
  }
  if (env.devUrl !== undefined) {
    const dev = parseDatabaseTarget(env.devUrl);
    if (dev && !isTestLikeTarget(dev) && isSameTarget(target, dev)) {
      throw new Error(
        "TEST_DATABASE_URL points at the development database. Refusing to run."
      );
    }
  }
  return target;
}

// Lab 4 (Issue #77, D-08) — exact scratch-target identity gate for
// destructive drills (e.g. MIG-04 recovery). The shared assertTestTarget
// above is intentionally symmetric: it accepts ANY test-like database,
// which cannot distinguish a dedicated scratch database from the shared
// test database. This function adds the machine-checkable identity the
// drill requires, without weakening the shared guard:
//   1. target parses and is test-like (delegates to assertTestTarget);
//   2. database name EQUALS the expected scratch name (config-sourced by the
//      caller — never hardcoded here, so CI can parameterize it);
//   3. target is NOT the dev database and NOT the shared test database
//      (exact inequality on host+port+database+schema);
//   4. host and port EQUAL the expected values (no remote test-like
//      database qualifies by name alone).
// Any mismatch throws before any destructive SQL may run.
export function assertScratchTarget(env: {
  scratchUrl: string | undefined;
  expected: { database: string; host: string; port: number };
  devUrl?: string | undefined;
  sharedTestUrl?: string | undefined;
}): DatabaseTarget {
  const raw = typeof env.scratchUrl === "string" ? env.scratchUrl.trim() : "";
  if (raw.length === 0) {
    throw new Error("Scratch database URL is not set. Refusing to run destructive drill.");
  }
  const target = parseDatabaseTarget(raw);
  if (!target) {
    throw new Error("Scratch database URL is not a valid PostgreSQL connection URL. Refusing to run.");
  }
  if (!isTestLikeTarget(target)) {
    throw new Error(
      `Scratch database "${target.database}" does not look like a test database. Refusing to run.`
    );
  }
  if (target.database !== env.expected.database) {
    throw new Error(
      `Scratch database "${target.database}" is not the expected scratch database "${env.expected.database}". Refusing to run.`
    );
  }
  if (target.host !== env.expected.host.toLowerCase() || target.port !== env.expected.port) {
    throw new Error(
      "Scratch database host/port does not match the expected target. Refusing to run."
    );
  }
  if (env.devUrl !== undefined) {
    const dev = parseDatabaseTarget(env.devUrl);
    if (dev && isSameTarget(target, dev)) {
      throw new Error("Scratch target is identical to the development database. Refusing to run.");
    }
  }
  if (env.sharedTestUrl !== undefined) {
    const shared = parseDatabaseTarget(env.sharedTestUrl);
    if (shared && isSameTarget(target, shared)) {
      throw new Error("Scratch target is identical to the shared test database. Refusing to run.");
    }
  }
  return target;
}
