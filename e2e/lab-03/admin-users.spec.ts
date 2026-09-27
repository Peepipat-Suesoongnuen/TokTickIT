// Lab 3 admin-users E2E (Issue #50, E2E-05, AC-13–15).
//
// Administrator flow: User Management list → search → create user with
// initial password → edit safety (self-deactivation conflict) → set a new
// initial password for the created user → target signs in and lands on the
// mandatory-change gate.
//
// Fixtures are dedicated fixed e2e-owned users (never seeded ones).
import { expect, test } from "@playwright/test";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { getTestDatabaseUrl } from "../lab-02/test-env";

const ADMIN_NAME = "E2E Admin Manager";
const ADMIN_EMAIL = "e2e-admin-manager@example.com";
const ADMIN_PASSWORD = "E2E-Admin#Mgr-Gg7!";
const TARGET_EMAIL = "e2e-admin-target@example.com";
const TARGET_INITIAL = "E2E-Target#Init-Hh8!";
const TARGET_RESET = "E2E-Target#Reset-Ii9!";

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
  runUserHelper(["setup", ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME, "ADMINISTRATOR", "false"]);
});

test.afterAll(() => {
  runUserHelper(["cleanup", ADMIN_EMAIL]);
  runUserHelper(["cleanup", TARGET_EMAIL]);
});

test("E2E-05 admin manages users, resets password, target faces change gate", async ({ page }) => {
  await page.goto("/");
  await page.locator("#login-email").fill(ADMIN_EMAIL);
  await page.locator("#login-password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page.locator(".lab3-user-menu")).toContainText("ADMINISTRATOR");
  // Administrators land on the staff queue; open User Management.
  await page.getByRole("link", { name: "User Management" }).click();
  await expect(page.getByRole("heading", { name: "User Management" })).toBeVisible();

  // Search narrows the list.
  await page.getByLabel(/Search/).fill(ADMIN_EMAIL);
  await expect(page.getByText(ADMIN_EMAIL).first()).toBeVisible();
  await page.getByLabel(/Search/).fill("");
  await page.getByLabel(/Role/).selectOption("ADMINISTRATOR");
  await expect(page.getByText(ADMIN_EMAIL).first()).toBeVisible();
  await page.getByRole("button", { name: "Clear Filters" }).click();

  // Create a user with an initial password.
  await page.getByRole("link", { name: "Create User" }).click();
  await page.getByLabel(/Name/).fill("E2E Target User");
  await page.getByLabel(/Email/).fill(TARGET_EMAIL);
  await page.getByLabel(/Role/).selectOption("IT_STAFF");
  await page.getByLabel(/Initial Password/).fill(TARGET_INITIAL);
  await page.getByRole("button", { name: "Create User" }).click();
  await expect(page.getByRole("heading", { name: "User Management" })).toBeVisible();
  await page.getByLabel(/Search/).fill(TARGET_EMAIL);
  await expect(page.getByText(TARGET_EMAIL).first()).toBeVisible();

  // Edit safety: self-deactivation is rejected with actionable copy.
  await page.getByLabel(/Search/).fill(ADMIN_EMAIL);
  await page.getByRole("row", { name: new RegExp(ADMIN_NAME) }).click();
  await expect(page.getByRole("heading", { name: "Edit User" })).toBeVisible();
  await page.getByLabel(/Active/).uncheck();
  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect(page.getByText("You cannot deactivate your own account.")).toBeVisible();

  // Reset the target's initial password; no secret is echoed.
  await page.getByRole("link", { name: "User Management" }).first().click();
  await expect(page.getByRole("heading", { name: "User Management" })).toBeVisible();
  await page.getByLabel(/Search/).fill(TARGET_EMAIL);
  // Scope to the desktop table (mobile cards render the same text hidden).
  await page.getByRole("table").getByText(TARGET_EMAIL).click();
  await expect(page.getByRole("heading", { name: "Edit User" })).toBeVisible();
  await page.getByRole("link", { name: "Set New Initial Password" }).click();
  await page.getByLabel(/New Initial Password/).fill(TARGET_RESET);
  await page.getByLabel(/Confirm Password/).fill(TARGET_RESET);
  await page.getByRole("button", { name: "Set Password" }).click();
  await expect(page.getByText("Initial password updated. The user must change it at next sign-in.")).toBeVisible();

  // Target signs in with the reset password and faces the change gate.
  await page.getByRole("button", { name: "User menu" }).click();
  await page.getByRole("menuitem", { name: "Logout" }).click();
  await page.locator("#login-email").fill(TARGET_EMAIL);
  await page.locator("#login-password").fill(TARGET_RESET);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page.getByRole("heading", { name: "Change Password" })).toBeVisible();
});
