import path from "node:path";
import { spawnSync } from "node:child_process";
import { getTestDatabaseUrl } from "./test-env";

function runPrisma(args: string[], env: NodeJS.ProcessEnv) {
  const prismaCli = path.resolve("server", "node_modules", "prisma", "build", "index.js");
  const result = spawnSync(process.execPath, [prismaCli, ...args], {
    cwd: path.resolve("server"),
    env,
    encoding: "utf8",
    stdio: "pipe",
  });

  if (result.error || result.status !== 0) {
    throw new Error(
      `Prisma ${args.join(" ")} failed.\n${result.error?.message ?? ""}\n${result.stdout ?? ""}\n${result.stderr ?? ""}`,
    );
  }
}

function runSeed(env: NodeJS.ProcessEnv) {
  const tsxCli = path.resolve("server", "node_modules", "tsx", "dist", "cli.mjs");
  const seedFile = path.resolve("server", "prisma", "seed.ts");
  const result = spawnSync(process.execPath, [tsxCli, seedFile], {
    cwd: path.resolve("server"),
    env,
    encoding: "utf8",
    stdio: "pipe",
  });

  if (result.error || result.status !== 0) {
    throw new Error(
      `Prisma seed failed.\n${result.error?.message ?? ""}\n${result.stdout ?? ""}\n${result.stderr ?? ""}`,
    );
  }
}

function runBackfill(env: NodeJS.ProcessEnv) {
  const tsxCli = path.resolve("server", "node_modules", "tsx", "dist", "cli.mjs");
  const backfillFile = path.resolve("server", "prisma", "backfill-migrated-passwords.ts");
  const result = spawnSync(process.execPath, [tsxCli, backfillFile], {
    cwd: path.resolve("server"),
    env,
    encoding: "utf8",
    stdio: "pipe",
  });

  if (result.error || result.status !== 0) {
    throw new Error(
      `Prisma backfill failed.\n${result.error?.message ?? ""}\n${result.stdout ?? ""}\n${result.stderr ?? ""}`,
    );
  }
}
function runE2EUser(env: NodeJS.ProcessEnv) {
  // Dedicated e2e-owned login users (Issue #45 isolation fix + Issue #46
  // two-user flow): UPSERT with a fresh initial hash EVERY run, so Lab-2
  // specs never touch seeded users. Password literals mirror
  // LAB02_INITIAL_PASSWORD in ./auth-helper.ts (duplicated because this
  // setup file cannot import the Playwright-side helper's server-alias
  // workaround pattern — same known limitation).
  const tsxCli = path.resolve("server", "node_modules", "tsx", "dist", "cli.mjs");
  const script = path.resolve("e2e", "lab-03", "e2e-user.ts");
  for (const [email, name] of [
    ["e2e-requester@example.com", "E2E Requester"],
    ["e2e-requester-b@example.com", "E2E Requester B"],
  ] as const) {
    const result = spawnSync(
      process.execPath,
      [tsxCli, script, "setup", email, "Requester#2026-local", name],
      { cwd: path.resolve("."), env, encoding: "utf8", stdio: "pipe" },
    );

    if (result.error || result.status !== 0) {
      throw new Error(
        `E2E user setup failed (${email}).\n${result.error?.message ?? ""}\n${result.stdout ?? ""}\n${result.stderr ?? ""}`,
      );
    }
  }
}
export default async function globalSetup() {
  const testDatabaseUrl = getTestDatabaseUrl();
  const env = {
    ...process.env,
    NODE_ENV: "test",
    DATABASE_URL: testDatabaseUrl,
    TEST_DATABASE_URL: testDatabaseUrl,
  };

  // Safe because test-env.ts refuses any database name other than toktickit_test.
  // Unique E2E fixtures avoid destructive resets while keeping runs repeatable.
  runPrisma(["migrate", "deploy"], env);
  runSeed(env);
  runBackfill(env);
  runE2EUser(env);
}
