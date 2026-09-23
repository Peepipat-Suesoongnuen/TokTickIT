// Issue #57 — guarded test-database gate CLI.
//
// Usage:
//   tsx prisma/guard-test-target.ts -- <command> [args...]
//
// Validates TEST_DATABASE_URL (fail-closed, never falls back to the
// development database) and then spawns the guarded command with the
// current environment. With no command, validates only. The guarded
// command NEVER spawns when validation fails (non-zero exit first).
//
// Used by CI before `prisma migrate deploy` / `prisma db seed` and
// available for local test-DB preparation.
import { spawnSync } from "node:child_process";
import { assertTestTarget } from "../src/lib/test-target-guard.js";

function main(): void {
  const dashdash = process.argv.indexOf("--");
  try {
    const target = assertTestTarget({
      testUrl: process.env.TEST_DATABASE_URL,
      devUrl: process.env.DATABASE_URL,
    });
    console.log(`test target ok: ${target.host}:${target.port}/${target.database} (schema ${target.schema})`);
  } catch (err) {
    console.error((err as Error).message);
    process.exit(2);
  }
  if (dashdash < 0) return;
  const [cmd, ...args] = process.argv.slice(dashdash + 1);
  if (!cmd) {
    console.error("guard-test-target: missing command after --");
    process.exit(2);
  }
  // Spawn without a shell first (exact argv, no quoting hazards); on
  // Windows fall back to a shell only when the binary needs it (ENOENT
  // covers .cmd/.bat shims such as npx/prisma).
  let result = spawnSync(cmd, args, { stdio: "inherit", shell: false });
  if (result.error && (result.error as NodeJS.ErrnoException).code === "ENOENT" && process.platform === "win32") {
    result = spawnSync(cmd, args, { stdio: "inherit", shell: true });
  }
  if (result.error) {
    console.error(`guard-test-target: failed to run guarded command: ${(result.error as Error).message}`);
    process.exit(1);
  }
  process.exit(result.status ?? 1);
}

main();
