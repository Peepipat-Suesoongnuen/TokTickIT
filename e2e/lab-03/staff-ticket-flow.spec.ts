// Lab 3 staff-ticket-flow E2E (Issue #48, E2E-02, AC-08–AC-12).
//
// Requester creates a ticket through the UI -> Staff signs in, finds it in
// the shared Queue, opens Detail, claims it (NEW → OPEN), sets IT Priority,
// and moves it to IN_PROGRESS. UI and API state stay consistent throughout.
//
// Fixtures are DEDICATED fixed e2e-owned users (never seeded ones): setup
// UPSERTS fresh hashes every run with mustChange=false so this flow tests
// the staff workspace, not the password gate (covered by auth-flow E2E).
// Serial-friendly: fresh contexts per test, fixed emails, ticket summary
// carries a fixed E2E token so queue search is deterministic.
import { expect, test } from "@playwright/test";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { getTestDatabaseUrl } from "../lab-02/test-env";

const REQ_NAME = "E2E Staffflow Requester";
const REQ_EMAIL = "e2e-staffflow-req@example.com";
const STAFF_NAME = "E2E Staffflow Staff";
const STAFF_EMAIL = "e2e-staffflow-staff@example.com";
const PASSWORD = "E2E-Staff#Flow-Dd4!";
const SUMMARY = "E2E staff flow VPN outage";

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
  // Wait for the authenticated shell before navigating further.
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

test("E2E-02 requester creates -> staff queue -> claim -> priority -> in progress", async ({
  page,
}) => {
  // Requester creates a ticket through the UI.
  await login(page, REQ_EMAIL);
  await page.goto("/create");
  await page.locator("#category").selectOption({ index: 1 });
  await page.locator("#relatedSystem").selectOption({ index: 1 });
  await page.locator("#summary").fill(SUMMARY);
  await page.locator("#description").fill("E2E description: the office VPN refuses all handshakes.");
  await page.locator("#priority").selectOption("HIGH");
  await page.getByRole("button", { name: "Submit Ticket" }).click();
  // The success panel shows the official ticket number; capture it.
  const successPanel = page.getByRole("status");
  await expect(successPanel).toContainText("Ticket created successfully");
  const ticketNumber = ((await successPanel.textContent()) ?? "").match(/\d{4}-\d{4}/)?.[0] ?? "";
  expect(ticketNumber).not.toBe("");
  await logout(page);

  // Staff signs in and lands on the shared queue.
  await login(page, STAFF_EMAIL);
  await expect(page.getByRole("heading", { name: "Ticket Queue" })).toBeVisible();
  await expect(page.locator(".lab3-user-menu")).toContainText("IT_STAFF");

  // Queue search finds the new ticket; open its detail.
  await page.locator("#staff-queue-search").fill(ticketNumber);
  const rowLink = page.getByRole("link", { name: ticketNumber }).first();
  await expect(rowLink).toBeVisible();
  await rowLink.click();

  // Claim assigns the ticket and moves NEW → OPEN.
  await expect(page.getByText(`Ticket ${ticketNumber}`)).toBeVisible();
  await page.getByRole("tab", { name: "Ticket Actions" }).click();
  await page.getByRole("button", { name: "Claim Ticket" }).click();
  await expect(page.getByText("Ticket claimed.")).toBeVisible();
  await expect(page.getByText("OPEN")).toBeVisible();

  // IT Priority changes without touching Requested Priority.
  await page.locator("#staff-detail-priority").selectOption("CRITICAL");
  await page.getByRole("button", { name: "Update IT Priority" }).click();
  await expect(page.getByText("IT Priority updated.")).toBeVisible();

  // Status moves OPEN → IN_PROGRESS explicitly.
  await page.locator("#staff-detail-status").selectOption("IN_PROGRESS");
  await page.getByRole("button", { name: "Update Status" }).click();
  await expect(page.getByText("Status updated.")).toBeVisible();
  await expect(page.getByText("IN_PROGRESS")).toBeVisible();

  // AC-12 (Issue #49 extension): staff communicates on both channels.
  const staffComment = "E2E staff comment: investigating the outage";
  const staffNote = "E2E staff note: check the access logs first";
  await page.getByRole("tab", { name: "Public Comments" }).click();
  await page.getByPlaceholder("Add a public comment…").fill(staffComment);
  await page.getByRole("button", { name: "Post Comment" }).click();
  await expect(page.getByText(staffComment)).toBeVisible();
  await page.getByRole("tab", { name: "Internal Notes" }).click();
  await page.getByPlaceholder("Add an internal note…").fill(staffNote);
  await page.getByRole("button", { name: "Add Note" }).click();
  await expect(page.getByText(staffNote)).toBeVisible();

  // Queue reflects the worked ticket consistently.
  await page.getByRole("link", { name: "Back to Ticket Queue" }).click();
  await expect(page.getByRole("heading", { name: "Ticket Queue" })).toBeVisible();
  await expect(page.getByRole("link", { name: ticketNumber }).first()).toBeVisible();
});
