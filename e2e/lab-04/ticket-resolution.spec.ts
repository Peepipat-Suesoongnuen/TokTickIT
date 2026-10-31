// Lab 4 E2E-02: blocked resolve → complete → resolve → close → reopen →
// resolve-again journey (Issue #81, AC-010–AC-013).
//
// The resolution gate stays visible at every step: blocked with zero
// completions, passing after a current-cycle completion, closing, reopening
// into a fresh cycle, and re-arming (old-cycle completions never satisfy
// the new gate).
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

const REQ_EMAIL = "e2e-lab04-e2e2-req@example.com";
const STAFF_EMAIL = "e2e-lab04-e2e2-staff@example.com";
const SUMMARY = "E2E lab-04 resolution journey printer offline";

test.beforeAll(() => {
  setupUser(REQ_EMAIL, "E2E Lab04 E2E2 Req", "REQUESTER");
  setupUser(STAFF_EMAIL, "E2E Lab04 E2E2 Staff", "IT_STAFF");
});

test.afterAll(() => {
  cleanupUser(REQ_EMAIL);
  cleanupUser(STAFF_EMAIL);
});

async function setStatus(page: import("@playwright/test").Page, status: string): Promise<void> {
  await page.locator("#staff-detail-status").selectOption(status);
  await page.getByRole("button", { name: "Update Status" }).click();
}

test("E2E-02 resolve is blocked, then passes, closes, reopens, and re-arms", async ({ page }) => {
  const pageFaults = trackPageFaults(page);
  // Status changes and action completion both use confirm dialogs.
  page.on("dialog", (dialog) => void dialog.accept());

  await login(page, REQ_EMAIL);
  const ticketNumber = await createTicketViaUI(page, SUMMARY);
  await logout(page);

  await login(page, STAFF_EMAIL);
  await openStaffTicket(page, ticketNumber);
  await page.getByRole("tab", { name: "Ticket Actions" }).click();
  await page.getByRole("button", { name: "Claim Ticket" }).click();
  await expect(page.getByText("Ticket claimed.")).toBeVisible();
  await setStatus(page, "IN_PROGRESS");
  await expect(page.getByText("Status updated.")).toBeVisible();

  // Blocked resolve: zero completions in cycle 1 — gate stays visible.
  await setStatus(page, "RESOLVED");
  await expect(page.getByText("No completed work")).toBeVisible();

  // Record + complete one action in cycle 1.
  await page.getByRole("button", { name: "Record action" }).click();
  await page.locator("#action-form-description").fill("E2E lab-04: reseat the toner cartridge.");
  await page.getByRole("button", { name: "Use current time" }).click();
  await page.locator("#action-form-result").fill("E2E lab-04: test page prints clean.");
  await page.getByRole("button", { name: "Create action" }).click();
  await expect(page.getByText("Action recorded.")).toBeVisible();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByText("Action started.")).toBeVisible();
  await page.getByRole("button", { name: "Complete", exact: true }).click();
  await expect(page.getByText("Action completed.")).toBeVisible();

  // Resolve now passes; close it.
  await setStatus(page, "RESOLVED");
  await expect(page.getByText("Status updated.")).toBeVisible();
  await setStatus(page, "CLOSED");
  await expect(page.getByText("Status updated.")).toBeVisible();

  // Reopen into a fresh cycle (historical owner is eligible: keep default).
  await setStatus(page, "REOPENED");
  await expect(page.getByText("Status updated.")).toBeVisible();
  await expect(page.getByText("Cycle 2")).toBeVisible();

  // Re-arm proof: the cycle-1 completion does NOT satisfy the new gate.
  await setStatus(page, "IN_PROGRESS");
  await expect(page.getByText("Status updated.")).toBeVisible();
  await setStatus(page, "RESOLVED");
  await expect(page.getByText("No completed work")).toBeVisible();

  // Complete fresh work in cycle 2, then resolve again.
  await page.getByRole("button", { name: "Record action" }).click();
  await page.locator("#action-form-description").fill("E2E lab-04 cycle 2: replace the fuser unit.");
  await page.getByRole("button", { name: "Use current time" }).click();
  await page.locator("#action-form-result").fill("E2E lab-04 cycle 2: printer online.");
  await page.getByRole("button", { name: "Create action" }).click();
  await expect(page.getByText("Action recorded.")).toBeVisible();
  await page.getByRole("button", { name: "Start", exact: true }).last().click();
  await expect(page.getByText("Action started.")).toBeVisible();
  await page.getByRole("button", { name: "Complete", exact: true }).last().click();
  await expect(page.getByText("Action completed.")).toBeVisible();
  await setStatus(page, "RESOLVED");
  await expect(page.getByText("Status updated.")).toBeVisible();

  expect(pageFaults).toEqual([]);
});
