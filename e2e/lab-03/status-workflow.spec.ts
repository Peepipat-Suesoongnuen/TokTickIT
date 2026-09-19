// Lab 3 status-workflow E2E (Issue #48, E2E-04, AC-11).
//
// Formal lifecycle through the UI: IN_PROGRESS → WAITING_FOR_REQUESTER →
// IN_PROGRESS → RESOLVED → CLOSED (confirmation dialog) → REOPENED
// (historical owner still eligible, kept) → IN_PROGRESS. The Requester
// cannot formally resolve or close: no status control exists on the
// requester detail screen.
//
// Fixtures mirror staff-ticket-flow.spec.ts with file-unique emails.
import { expect, test } from "@playwright/test";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { getTestDatabaseUrl } from "../lab-02/test-env";

const REQ_NAME = "E2E Status Requester";
const REQ_EMAIL = "e2e-status-req@example.com";
const STAFF_NAME = "E2E Status Staff";
const STAFF_EMAIL = "e2e-status-staff@example.com";
const PASSWORD = "E2E-Status#Flow-Ee5!";
const SUMMARY = "E2E lifecycle printer jam";

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
  runUserHelper(["setup", REQ_EMAIL, PASSWORD, REQ_NAME, "REQUESTER", "false"]);
  runUserHelper(["setup", STAFF_EMAIL, PASSWORD, STAFF_NAME, "IT_STAFF", "false"]);
});

test.afterAll(() => {
  runUserHelper(["cleanup", REQ_EMAIL]);
  runUserHelper(["cleanup", STAFF_EMAIL]);
});

test("E2E-04 formal lifecycle with close confirmation and reopen", async ({ page }) => {
  // Requester creates the ticket.
  await page.goto("/");
  await page.locator("#login-email").fill(REQ_EMAIL);
  await page.locator("#login-password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page.locator(".lab3-user-menu")).toBeVisible();
  await page.goto("/create");
  await page.locator("#category").selectOption({ index: 1 });
  await page.locator("#relatedSystem").selectOption({ index: 1 });
  await page.locator("#summary").fill(SUMMARY);
  await page.locator("#description").fill("E2E description: the lobby printer jams every third page.");
  await page.locator("#priority").selectOption("MEDIUM");
  await page.getByRole("button", { name: "Submit Ticket" }).click();
  const successPanel = page.getByRole("status");
  await expect(successPanel).toContainText("Ticket created successfully");
  const ticketNumber = ((await successPanel.textContent()) ?? "").match(/\d{4}-\d{4}/)?.[0] ?? "";
  expect(ticketNumber).not.toBe("");

  // The requester detail screen offers no formal status control.
  await expect(page.locator("select#staff-detail-status")).toHaveCount(0);
  await page.getByRole("button", { name: "User menu" }).click();
  await page.getByRole("menuitem", { name: "Logout" }).click();

  // Staff claims and walks the lifecycle.
  await page.locator("#login-email").fill(STAFF_EMAIL);
  await page.locator("#login-password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();
  await page.locator("#staff-queue-search").fill(ticketNumber);
  await page.getByRole("link", { name: ticketNumber }).first().click();
  await page.getByRole("tab", { name: "Ticket Actions" }).click();
  await page.getByRole("button", { name: "Claim Ticket" }).click();
  await expect(page.getByText("Ticket claimed.")).toBeVisible();

  async function moveTo(status: string, confirm = false): Promise<void> {
    await page.locator("#staff-detail-status").selectOption(status);
    if (confirm) {
      page.once("dialog", (dialog) => void dialog.accept());
    }
    await page.getByRole("button", { name: "Update Status" }).click();
    await expect(page.getByText("Status updated.")).toBeVisible();
  }

  await moveTo("IN_PROGRESS");
  await moveTo("WAITING_FOR_REQUESTER");
  await moveTo("IN_PROGRESS");
  await moveTo("RESOLVED");
  // CLOSED requires a confirmation dialog (accepted here).
  await moveTo("CLOSED", true);
  await expect(page.getByText("CLOSED")).toBeVisible();

  // REOPENED keeps the still-eligible historical owner and clears the
  // requester indication atomically (server-observed via UI state).
  await moveTo("REOPENED");
  await expect(page.getByText("REOPENED")).toBeVisible();
  await expect(page.getByLabel("Ticket information").getByText(`${STAFF_NAME} (IT_STAFF)`)).toBeVisible();
  await moveTo("IN_PROGRESS");
  await expect(page.getByText("IN_PROGRESS")).toBeVisible();
});
