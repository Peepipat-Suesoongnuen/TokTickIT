import { describe, it, expect, vi, afterEach } from "vitest";

// Issue #57 — getPrisma() fails closed under test config: with no
// TEST_DATABASE_URL (and no .env to hide behind), the first database
// access throws instead of silently using the development database.
// Module isolation gives this test a fresh prisma singleton.
describe("getPrisma fail-closed wiring (Issue #57)", () => {
  const savedTest = process.env.TEST_DATABASE_URL;
  const savedNode = process.env.NODE_ENV;

  afterEach(() => {
    if (savedTest !== undefined) process.env.TEST_DATABASE_URL = savedTest;
    if (savedNode !== undefined) process.env.NODE_ENV = savedNode;
    vi.resetModules();
  });

  it("throws instead of falling back when TEST_DATABASE_URL is missing", async () => {
    vi.resetModules();
    // NOTE: `delete process.env.X` is a silent no-op in this worker
    // (non-configurable env binding); empty string exercises the same
    // missing-config path in the guard.
    process.env.TEST_DATABASE_URL = "";
    process.env.NODE_ENV = "test";
    const mod = await import("../../src/prisma.js");
    expect(() => mod.getPrisma()).toThrow(/TEST_DATABASE_URL is not set/);
  });

  it("throws when TEST_DATABASE_URL points at the development database", async () => {
    vi.resetModules();
    process.env.NODE_ENV = "test";
    process.env.TEST_DATABASE_URL = "postgresql://toktickit:toktickit@localhost:5432/toktickit?schema=public";
    const mod = await import("../../src/prisma.js");
    expect(() => mod.getPrisma()).toThrow(/test database/i);
  });
});
