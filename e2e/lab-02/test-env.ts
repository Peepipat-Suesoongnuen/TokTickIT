import fs from "node:fs";
import path from "node:path";

function readEnvValue(filePath: string, key: string): string | undefined {
  if (!fs.existsSync(filePath)) return undefined;
  const line = fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .find((entry) => entry.trim().startsWith(`${key}=`));
  if (!line) return undefined;
  return line.slice(line.indexOf("=") + 1).trim().replace(/^['"]|['"]$/g, "");
}

export function getTestDatabaseUrl(): string {
  const fromProcess = process.env.TEST_DATABASE_URL;
  const fromServerEnv = readEnvValue(path.resolve("server", ".env"), "TEST_DATABASE_URL");
  const url = fromProcess ?? fromServerEnv;

  if (!url) {
    throw new Error(
      "Issue 11 E2E requires TEST_DATABASE_URL. Set it to the dedicated Lab 2 test database before running Playwright.",
    );
  }

  let databaseName = "";
  try {
    databaseName = new URL(url).pathname.replace(/^\//, "");
  } catch {
    throw new Error("TEST_DATABASE_URL must be a valid PostgreSQL URL.");
  }

  if (databaseName !== "toktickit_test") {
    throw new Error(
      `Refusing to run destructive E2E setup against database '${databaseName || "unknown"}'. Expected 'toktickit_test'.`,
    );
  }

  return url;
}
