import { PrismaClient } from "@prisma/client";

// Lazy singleton: the client is created on first use, not at import time.
// This keeps route modules and tests that don't touch the DB (e.g. /api/health)
// free of database side effects.
let client: PrismaClient | null = null;

export function getPrisma(): PrismaClient {
  if (!client) {
    // Use dedicated test database when running tests (tests.md §5) — falls back to
    // DATABASE_URL for local dev so DoD scope is unchanged. No TEST_DATABASE_URL
    // required in dev; when set, tests run isolated from the development DB.
    const url = process.env.NODE_ENV === "test" ? process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL : process.env.DATABASE_URL;
    client = new PrismaClient(url ? { datasources: { db: { url } } } : undefined);
  }
  return client;
}
