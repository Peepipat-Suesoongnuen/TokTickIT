// Lab 3 requester-staff communication E2E (Issue #49, E2E-03, AC-06/12).
//
// Cross-role flow: Requester comments + indicates the problem appears
// resolved -> Staff sees the comment and the indication (status unchanged),
// adds a public reply and a private Internal Note -> Requester sees the
// public reply but never the note content.
//
// Fixtures mirror staff-ticket-flow.spec.ts with file-unique emails.
import { expect, test } from "@playwright/test";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { getTestDatabaseUrl } from "../lab-02/test-env";

const REQ_NAME = "E2E Comm Requester";
const REQ_EMAIL = "e2e-comm-req@example.com";
const STAFF_NAME = "E2E Comm Staff";
const STAFF_EMAIL = "e2e-comm-staff@example.com";
const PASSWORD = "E2E-Comm#Flow-Ff6!";
const SUMMARY = "E2E cross-role SSO hiccup";
const REQ_COMMENT = "E2E req comment: still failing after restart";
const STAFF_COMMENT = "E2E staff reply: checking the identity logs";
const STAFF_NOTE = "E2E private note: likely a stale directory cache";

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

async function login(page: import("@playwright/test").Page, email: string): Promise<void> {
  await page.goto("/");
  await page.locator("#login-email").fill(email);
  await page.locator("#login-password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page.locator(".lab3-user-menu")).toBeVisible();
}

async function logout(page: import("@playwright/test").Page): Promise<void> {
  await page.getByRole("button", { name: "User menu" }).click();
  await page.getByRole("menuitem", { name: "Logout" }).click();
  await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();
}

test.beforeAll(() => {
  runUserHelper(["setup", REQ_EMAIL, PASSWORD, REQ_NAME, "REQUESTER", "false"]);
  runUserHelper(["setup", STAFF_EMAIL, PASSWORD, STAFF_NAME, "IT_STAFF", "false"]);
});

test.afterAll(() => {
  runUserHelper(["cleanup", REQ_EMAIL]);
  runUserHelper(["cleanup", STAFF_EMAIL]);
});

test("E2E-03 requester comments + indicates -> staff replies + notes privately", async ({
  page,
}) => {
  // Requester creates a ticket, comments, and indicates resolution.
  await login(page, REQ_EMAIL);
  await page.goto("/create");
  await page.locator("#category").selectOption({ index: 1 });
  await page.locator("#relatedSystem").selectOption({ index: 1 });
  await page.locator("#summary").fill(SUMMARY);
  await page.locator("#description").fill("E2E description: single sign-on loops back to login.");
  await page.locator("#priority").selectOption("MEDIUM");
  await page.getByRole("button", { name: "Submit Ticket" }).click();
  const successPanel = page.getByRole("status");
  await expect(successPanel).toContainText("Ticket created successfully");
  const ticketNumber = ((await successPanel.textContent()) ?? "").match(/\d{4}-\d{4}/)?.[0] ?? "";
  expect(ticketNumber).not.toBe("");

  await page.goto("/my-tickets");
  await page.getByRole("link", { name: ticketNumber }).first().click();
  await page.getByRole("tab", { name: "Public Comments" }).click();
  await page.getByPlaceholder("Add a public comment…").fill(REQ_COMMENT);
  await page.getByRole("button", { name: "Post Comment" }).click();
  await expect(page.getByText(REQ_COMMENT)).toBeVisible();

  await page.getByRole("tab", { name: "Ticket Actions" }).click();
  await page.getByRole("button", { name: "Problem Appears Resolved" }).click();
  await expect(page.getByText("You indicated that the problem appears resolved.")).toBeVisible();
  await logout(page);

  // Staff sees the comment and the indication without a status change,
  // replies publicly, and records a private note.
  await login(page, STAFF_EMAIL);
  await page.locator("#staff-queue-search").fill(ticketNumber);
  await page.getByRole("link", { name: ticketNumber }).first().click();
  await expect(page.getByText("Problem appears resolved")).toBeVisible();

  await page.getByRole("tab", { name: "Public Comments" }).click();
  await expect(page.getByText(REQ_COMMENT)).toBeVisible();
  await page.getByPlaceholder("Add a public comment…").fill(STAFF_COMMENT);
  await page.getByRole("button", { name: "Post Comment" }).click();
  await expect(page.getByText(STAFF_COMMENT)).toBeVisible();

  await page.getByRole("tab", { name: "Internal Notes" }).click();
  await page.getByPlaceholder("Add an internal note…").fill(STAFF_NOTE);
  await page.getByRole("button", { name: "Add Note" }).click();
  await expect(page.getByText(STAFF_NOTE)).toBeVisible();
  await logout(page);

  // Requester sees the public reply but never the private note.
  await login(page, REQ_EMAIL);
  await page.goto("/my-tickets");
  await page.getByRole("link", { name: ticketNumber }).first().click();
  await page.getByRole("tab", { name: "Public Comments" }).click();
  await expect(page.getByText(STAFF_COMMENT)).toBeVisible();
  await expect(page.getByText(STAFF_NOTE)).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Internal Notes" })).toHaveCount(0);
});
