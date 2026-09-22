// Lab 3 requester auth ticket flow E2E (Issue #51, E2E-01, AC-01/02/05).
//
// Requester first login with an initial password -> mandatory change gate
// blocks the app -> valid change -> Create Ticket -> discoverable in My
// Tickets -> owned Detail -> Attachment upload + Public Comment. Proves the
// Lab 2 flow continues under authenticated identity.
//
// Fixture is a dedicated fixed e2e-owned user (never a seeded one): setup
// UPSERTS a fresh initial hash every run (mustChange=true), so prior runs'
// password changes never leak into this run.
import { expect, test } from "@playwright/test";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { getTestDatabaseUrl } from "../lab-02/test-env";

const E2E_NAME = "E2E Reqflow Requester";
const E2E_EMAIL = "e2e-reqflow@example.com";
const INITIAL_PASSWORD = "E2E-Reqflow#Init-Aa1!";
const NEW_PASSWORD = "E2E-Reqflow#New-Bb2!";
const SUMMARY = "E2E reqflow attachment ticket";

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

test("E2E-01 first login -> change gate -> create -> list -> detail -> attachment + comment", async ({
  page,
}) => {
  // Login with the initial password lands on the mandatory gate; the
  // normal app is unavailable until a valid change succeeds.
  await page.goto("/");
  await page.locator("#login-email").fill(E2E_EMAIL);
  await page.locator("#login-password").fill(INITIAL_PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page.getByRole("heading", { name: "Change Password" })).toBeVisible();
  await expect(page.locator(".lab3-user-menu")).toHaveCount(0);

  await page.locator("#cp-current").fill(INITIAL_PASSWORD);
  await page.locator("#cp-new").fill(NEW_PASSWORD);
  await page.locator("#cp-confirm").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Change Password" }).click();
  await expect(page.locator(".lab3-user-menu")).toContainText(E2E_NAME);

  // Create Ticket under the authenticated identity.
  await page.goto("/create");
  await page.locator("#category").selectOption({ index: 1 });
  await page.locator("#relatedSystem").selectOption({ index: 1 });
  await page.locator("#summary").fill(SUMMARY);
  await page.locator("#description").fill("E2E description: first-login flow still works end to end.");
  await page.locator("#priority").selectOption("MEDIUM");
  await page.getByRole("button", { name: "Submit Ticket" }).click();
  const successPanel = page.getByRole("status");
  await expect(successPanel).toContainText("Ticket created successfully");
  const ticketNumber = ((await successPanel.textContent()) ?? "").match(/\d{4}-\d{4}/)?.[0] ?? "";
  expect(ticketNumber).not.toBe("");

  // Discoverable in My Tickets, owned Detail opens.
  await page.goto("/my-tickets");
  await page.locator("#my-tickets-search").fill(ticketNumber);
  await page.getByRole("link", { name: ticketNumber }).first().click();
  await expect(page.getByRole("heading", { name: `Ticket ${ticketNumber}` })).toBeVisible();

  // Attachment upload lifecycle on the owned ticket.
  await page.getByRole("tab", { name: "Attachments" }).click();
  const fileInput = page.getByLabel("Choose file");
  await fileInput.setInputFiles({
    name: "reqflow-note.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\nE2E reqflow fixture\n%%EOF"),
  });
  await expect(page.getByText("reqflow-note.pdf")).toBeVisible();

  // Public Comment on the owned ticket.
  await page.getByRole("tab", { name: "Public Comments" }).click();
  await page.getByPlaceholder("Add a public comment…").fill("E2E reqflow comment: created through the gate.");
  await page.getByRole("button", { name: "Post Comment" }).click();
  await expect(page.getByText("E2E reqflow comment: created through the gate.")).toBeVisible();
});
