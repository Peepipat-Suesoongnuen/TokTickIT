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
