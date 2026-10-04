// Lab 4 E2E-01: staff full action flow with requester read-only check
// (Issue #81, AC-001–AC-009).
//
// Requester creates a ticket -> staff claims -> records an action ->
// starts -> edits -> completes -> history shows the trail -> requester
// sees the same history read-only (no mutation controls).
//
// Fixtures are DEDICATED fixed e2e-owned users (never seeded ones).
import { expect, test } from "@playwright/test";
import {
  cleanupUser,
  createTicketViaUI,
  login,
  logout,
  openStaffTicket,
  setupUser,
  trackPageFaults,
} from "./helpers";

const REQ_EMAIL = "e2e-lab04-e2e1-req@example.com";
const STAFF_EMAIL = "e2e-lab04-e2e1-staff@example.com";
const SUMMARY = "E2E lab-04 action flow server room leak";

test.beforeAll(() => {
  setupUser(REQ_EMAIL, "E2E Lab04 E2E1 Req", "REQUESTER");
  setupUser(STAFF_EMAIL, "E2E Lab04 E2E1 Staff", "IT_STAFF");
});

test.afterAll(() => {
  cleanupUser(REQ_EMAIL);
  cleanupUser(STAFF_EMAIL);
});

test("E2E-01 staff full action flow with requester read-only check", async ({ page }) => {
  const pageFaults = trackPageFaults(page);

  // Requester creates the ticket through the UI.
  await login(page, REQ_EMAIL);
  const ticketNumber = await createTicketViaUI(page, SUMMARY);
  await logout(page);

  // Staff claims it (NEW -> OPEN) via the queue.
  await login(page, STAFF_EMAIL);
  const ticketId = await openStaffTicket(page, ticketNumber);
  await page.getByRole("tab", { name: "Ticket Actions" }).click();
  await page.getByRole("button", { name: "Claim Ticket" }).click();
  await expect(page.getByText("Ticket claimed.")).toBeVisible();
  await expect(page.getByText("OPEN")).toBeVisible();

  // Records an action with an explicit result up front.
  await page.getByRole("button", { name: "Record action" }).click();
  await page.locator("#action-form-description").fill("E2E lab-04: shut the water main and mop the floor.");
  await page.getByRole("button", { name: "Use current time" }).click();
  await page.locator("#action-form-result").fill("E2E lab-04: floor dry, monitoring overnight.");
  await page.getByRole("button", { name: "Create action" }).click();
  await expect(page.getByText("Action recorded.")).toBeVisible();

  // Starts it (PLANNED -> IN_PROGRESS).
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByText("Action started.")).toBeVisible();

  // Edits the description.
  await page.getByRole("button", { name: "Edit" }).first().click();
  await page.locator("#action-form-description").fill("E2E lab-04: shut the water main, mop, and dehumidify.");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("cell", { name: /dehumidify/ })).toBeVisible();

  // Completes it (terminal action; confirm dialog accepted).
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Complete", exact: true }).click();
  await expect(page.getByText("Action completed.")).toBeVisible();
  await expect(page.getByLabel("COMPLETED").first()).toBeVisible();

  // History shows the trail.
  await page.getByRole("button", { name: "History" }).first().click();
  const historyRegion = page.getByRole("region", { name: /History for action/ }).or(
    page.locator("[aria-label^='History for action']"),
  );
  await expect(historyRegion).toBeVisible();
  await expect(historyRegion).toContainText("COMPLETED");
  await logout(page);

  // Requester sees the same history read-only: no mutation controls.
  await login(page, REQ_EMAIL);
  await page.goto(`/tickets/${ticketId}`);
  await page.getByRole("tab", { name: "Ticket Actions" }).click();
  await page.getByRole("button", { name: "History" }).first().click();
  await expect(page.locator("[aria-label^='History for action']")).toContainText("COMPLETED");
  await expect(page.getByRole("button", { name: "Record action" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Start", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Complete", exact: true })).toHaveCount(0);

  expect(pageFaults).toEqual([]);
});
