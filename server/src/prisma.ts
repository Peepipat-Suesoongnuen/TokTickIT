import { PrismaClient } from "@prisma/client";
import { assertTestTarget } from "./lib/test-target-guard.js";

// Lazy singleton: the client is created on first use, not at import time.
// This keeps route modules and tests that don't touch the DB (e.g. /api/health)
// free of database side effects.
let client: PrismaClient | null = null;

export function getPrisma(): PrismaClient {
  if (!client) {
    // Issue #57 — fail closed: under test, a missing/invalid
    // TEST_DATABASE_URL throws instead of silently falling back to the
    // development database. Non-test runs use DATABASE_URL unchanged.
    let url: string | undefined;
    if (process.env.NODE_ENV === "test") {
      assertTestTarget({
        testUrl: process.env.TEST_DATABASE_URL,
        devUrl: process.env.DATABASE_URL,
      });
      url = process.env.TEST_DATABASE_URL;
    } else {
      url = process.env.DATABASE_URL;
    }
    client = new PrismaClient(url ? { datasources: { db: { url } } } : undefined);
  }
  return client;
}
