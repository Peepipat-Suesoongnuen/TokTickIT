// Lab 3 auth-flow E2E (Issue #45, Task 7).
//
// E2E-AUTH-01: valid login (run-unique mustChange fixture) -> mandatory
//   change-password gate -> valid change -> requester selection -> app shell
//   shows name+role -> logout -> login page again, protected route -> login.
// E2E-AUTH-02: invalid login shows the generic safe message (no account
//   detail). Locked/inactive behavior stays at API level — this suite never
//   burns 5-failure lockouts (slow + stateful).
//
// Fixtures are DEDICATED fixed e2e-owned users (never seeded ones): setup
// UPSERTS a fresh initial hash every run via e2e-user.ts, so prior runs'
// password changes never leak into this run. Serial-friendly: no shared
// state between the two tests (fresh context per test).
import { expect, test } from "@playwright/test";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { getTestDatabaseUrl } from "../lab-02/test-env";

const E2E_NAME = "E2E Auth";
const E2E_EMAIL = "e2e-auth@example.com";
// Policy-shaped (upper + lower + special, 8-64 chars) and distinct from each other.
// Fixed (NOT run-unique): setup upserts a fresh INITIAL hash every run, so the
// change-password mutation below never leaks across runs.
const INITIAL_PASSWORD = "E2E-Auth#Init-Aa1!";
const NEW_PASSWORD = "E2E-Auth#New-Bb2!";

function runUserHelper(args: string[]): void {
  const tsxCli = path.resolve("server", "node_modules", "tsx", "dist", "cli.mjs");
  const script = path.resolve("e2e", "lab-03", "e2e-user.ts");
  const testDatabaseUrl = getTestDatabaseUrl();
  const result = spawnSync(process.execPath, [tsxCli, script, ...args], {
    cwd: path.resolve("."),
    env: {
      ...process.env,
      NODE_ENV: "test",
      DATABASE_URL: testDatabaseUrl,
      TEST_DATABASE_URL: testDatabaseUrl,
    },
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`e2e-user ${args.join(" ")} failed.\n${result.stdout ?? ""}\n${result.stderr ?? ""}`);
  }
}

test.beforeAll(() => {
  runUserHelper(["setup", E2E_EMAIL, INITIAL_PASSWORD, E2E_NAME]);
});

test.afterAll(() => {
  runUserHelper(["cleanup", E2E_EMAIL]);
});

test("E2E-AUTH-01 valid login -> change password -> shell identity -> logout -> protected route", async ({
  page,
}) => {
  // Valid login lands on the mandatory change-password gate.
  await page.goto("/");
  await page.locator("#login-email").fill(E2E_EMAIL);
  await page.locator("#login-password").fill(INITIAL_PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page.getByRole("heading", { name: "Change Password" })).toBeVisible();

  // Valid change clears the gate.
  await page.locator("#cp-current").fill(INITIAL_PASSWORD);
  await page.locator("#cp-new").fill(NEW_PASSWORD);
  await page.locator("#cp-confirm").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Change Password" }).click();

  // Issue #46: the requester selector is deleted — the change gate lands
  // directly in the authenticated shell, where identity shows name+role.
  await expect(page.locator(".lab3-user-menu")).toContainText(E2E_NAME);
  await expect(page.locator(".lab3-user-menu")).toContainText("REQUESTER");

  // Logout returns to the login page.
  await page.getByRole("button", { name: "User menu" }).click();
  await page.getByRole("menuitem", { name: "Logout" }).click();
  await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();

  // Protected route renders login when logged out.
  await page.goto("/my-tickets");
  await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();
  await expect(page.locator(".lab3-user-menu")).toHaveCount(0);
});

test("E2E-AUTH-02 invalid login shows generic message without account detail", async ({ page }) => {
  await page.goto("/");
  await page.locator("#login-email").fill("e2e-unknown@example.com");
  await page.locator("#login-password").fill("Wrong#E2E-Cc3!");
  await page.getByRole("button", { name: "Sign In" }).click();

  const alert = page.getByRole("alert");
  await expect(alert).toContainText("Invalid email or password.");
  await expect(alert).not.toContainText(/locked|inactive|not found|unknown|disabled/i);
  await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();
});
