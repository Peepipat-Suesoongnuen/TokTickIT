import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Issue #57 — guard CLI integration: the guarded command never spawns
// when test config is missing/invalid, and does spawn when valid. Uses a
// sentinel file (in Temp, never the repo) as the spawn witness.
const TSX = path.resolve("node_modules", "tsx", "dist", "cli.mjs");
const SCRIPT = path.resolve("prisma", "guard-test-target.ts");
const SENTINEL = path.join(fs.realpathSync(os.tmpdir()), "toktickit-guard-probe.txt");

function runGuard(env: Record<string, string | undefined>, withCommand: boolean) {
  const args = withCommand
    ? [TSX, SCRIPT, "--", process.execPath, "-e", `require("fs").writeFileSync(${JSON.stringify(SENTINEL)}, "spawned")`]
    : [TSX, SCRIPT];
  const childEnv: Record<string, string> = { ...(process.env as Record<string, string>) };
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete childEnv[k];
    else childEnv[k] = v;
  }
  return spawnSync(process.execPath, args, { encoding: "utf8", env: childEnv });
}

function baseEnv(): Record<string, string | undefined> {
  return {
    NODE_ENV: "test",
    DATABASE_URL: "postgresql://toktickit:toktickit@localhost:5432/toktickit?schema=public",
    TEST_DATABASE_URL: "postgresql://toktickit:toktickit@localhost:5432/toktickit_test?schema=public",
  };
}

describe("guard-test-target CLI (Issue #57)", () => {
  beforeEach(() => {
    try {
      fs.unlinkSync(SENTINEL);
    } catch {
      /* absent is the point */
    }
  });

  afterEach(() => {
    try {
      fs.unlinkSync(SENTINEL);
    } catch {
      /* ignore */
    }
  });

  it("validates only (exit 0) with correct config and no command", () => {
    const r = runGuard(baseEnv(), false);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/test target ok: .*\/toktickit_test/);
    expect(r.stdout).not.toContain("toktickit:toktickit");
  });

  it("spawns the guarded command when config is valid", () => {
    const r = runGuard(baseEnv(), true);
    expect(r.status).toBe(0);
    expect(fs.existsSync(SENTINEL)).toBe(true);
  });

  it("never spawns on missing, invalid, non-test, or dev-target config", () => {
    const cases: Record<string, string | undefined>[] = [
      { ...baseEnv(), TEST_DATABASE_URL: undefined },
      { ...baseEnv(), TEST_DATABASE_URL: "" },
      { ...baseEnv(), TEST_DATABASE_URL: "mysql://u:p@localhost:3306/toktickit_test" },
      { ...baseEnv(), TEST_DATABASE_URL: "postgresql://toktickit:toktickit@localhost:5432/toktickit?schema=public" },
      {
        ...baseEnv(),
        TEST_DATABASE_URL: "postgresql://toktickit:toktickit@localhost:5432/toktickit?schema=public",
        DATABASE_URL: undefined,
      },
    ];
    for (const env of cases) {
      try {
        fs.unlinkSync(SENTINEL);
      } catch {
        /* ignore */
      }
      const r = runGuard(env, true);
      expect(r.status).not.toBe(0);
      expect(fs.existsSync(SENTINEL)).toBe(false);
      expect(`${r.stdout ?? ""}${r.stderr ?? ""}`).not.toContain("toktickit:toktickit");
    }
  });
});
