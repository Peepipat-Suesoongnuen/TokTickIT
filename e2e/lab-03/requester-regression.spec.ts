// Lab 3 requester regression E2E (Issue #51, E2E-07, AC-05).
//
// Authenticated Lab 2 behaviors keep working without the Development
// Requester selector: identity comes from the session, Create → My Tickets
// search/sort/pagination → owned Detail → Attachment upload/download/remove
// lifecycle with removal metadata.
//
// Fixture is a dedicated fixed e2e-owned requester (never a seeded one).
import { expect, test } from "@playwright/test";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { getTestDatabaseUrl } from "../lab-02/test-env";

const E2E_NAME = "E2E Reg Requester";
const E2E_EMAIL = "e2e-reg-req@example.com";
const PASSWORD = "E2E-Reg#Req-Dd8!";
const SUMMARY = "E2E regression attachment roundtrip";
const FILENAME = "regression-proof.pdf";

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
  runUserHelper(["setup", E2E_EMAIL, PASSWORD, E2E_NAME, "REQUESTER", "false"]);
});

test.afterAll(() => {
  runUserHelper(["cleanup", E2E_EMAIL]);
});

test("E2E-07 authenticated requester Lab 2 regression", async ({ page }) => {
  await page.goto("/");
  await page.locator("#login-email").fill(E2E_EMAIL);
  await page.locator("#login-password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();
  // Identity comes from the session; no requester selector exists.
  await expect(page.locator(".lab3-user-menu")).toContainText(E2E_NAME);
  await expect(page.getByText("Change Requester")).toHaveCount(0);

  // Create Ticket.
  await page.goto("/create");
  await page.locator("#category").selectOption({ index: 1 });
  await page.locator("#relatedSystem").selectOption({ index: 1 });
  await page.locator("#summary").fill(SUMMARY);
  await page.locator("#description").fill("E2E description: regression keeps Lab 2 behavior.");
  await page.locator("#priority").selectOption("HIGH");
  await page.getByRole("button", { name: "Submit Ticket" }).click();
  const successPanel = page.getByRole("status");
  await expect(successPanel).toContainText("Ticket created successfully");
  const ticketNumber = ((await successPanel.textContent()) ?? "").match(/\d{4}-\d{4}/)?.[0] ?? "";
  expect(ticketNumber).not.toBe("");

  // My Tickets search/sort finds it; detail opens with Lab 2 fields.
  await page.goto("/my-tickets");
  await page.locator("#my-tickets-search").fill(ticketNumber);
  await page.getByRole("link", { name: ticketNumber }).first().click();
  await expect(page.getByRole("heading", { name: `Ticket ${ticketNumber}` })).toBeVisible();
  await expect(page.getByLabel("Summary")).toHaveValue(SUMMARY);

  // Attachment upload → download → remove lifecycle.
  await page.getByRole("tab", { name: "Attachments" }).click();
  await page.getByLabel("Choose file").setInputFiles({
    name: FILENAME,
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\nE2E regression fixture\n%%EOF"),
  });
  await expect(page.getByText(FILENAME)).toBeVisible();

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download" }).first().click();
  const downloadEvent = await download;
  expect(downloadEvent.suggestedFilename()).toContain(".pdf");

  const row = page.locator("li", { hasText: FILENAME });
  await row.getByRole("button", { name: "Remove" }).click();
  await page.getByLabel("Reason").fill("Regression cleanup check");
  await page.getByRole("button", { name: "Confirm Removal" }).click();
  await expect(row).toContainText("Regression cleanup check");
});
