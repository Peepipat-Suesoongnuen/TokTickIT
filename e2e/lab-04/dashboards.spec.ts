// Lab 4 E2E-03: both dashboards with drill-down into filtered lists;
// ownership held (Issue #81, AC-014–AC-016).
//
// Requester A owns an OPEN/HIGH ticket; foreign Requester B owns another.
// Staff claims A's ticket and records an assigned action. Every drill-down
// card must land on the exact dataset; A's views must never show B's rows.
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

const REQ_A = "e2e-lab04-e2e3-reqa@example.com";
const REQ_B = "e2e-lab04-e2e3-reqb@example.com";
const STAFF = "e2e-lab04-e2e3-staff@example.com";
const ADMIN = "e2e-lab04-e2e3-admin@example.com";
const SUMMARY_A = "E2E lab-04 dashboard drill-down owned leak";
const SUMMARY_B = "E2E lab-04 dashboard foreign ticket";

test.beforeAll(() => {
  setupUser(REQ_A, "E2E Lab04 E2E3 ReqA", "REQUESTER");
  setupUser(REQ_B, "E2E Lab04 E2E3 ReqB", "REQUESTER");
  setupUser(STAFF, "E2E Lab04 E2E3 Staff", "IT_STAFF");
  setupUser(ADMIN, "E2E Lab04 E2E3 Admin", "ADMINISTRATOR");
});

test.afterAll(() => {
  cleanupUser(REQ_A);
  cleanupUser(REQ_B);
  cleanupUser(STAFF);
  cleanupUser(ADMIN);
});

test("E2E-03 dashboards drill down into exact datasets with ownership held", async ({ page }) => {
  const pageFaults = trackPageFaults(page);

  // Requester A owns an OPEN/HIGH ticket; B owns a foreign one.
  await login(page, REQ_A);
  const ticketA = await createTicketViaUI(page, SUMMARY_A);
  await logout(page);
  await login(page, REQ_B);
  const ticketB = await createTicketViaUI(page, SUMMARY_B);
  await logout(page);

  // Staff claims A's ticket and records an action assigned to self, so the
  // owned/assigned/urgent metrics all cover the same ticket.
  await login(page, STAFF);
  await openStaffTicket(page, ticketA);
  await page.getByRole("tab", { name: "Ticket Actions" }).click();
  await page.getByRole("button", { name: "Claim Ticket" }).click();
  await expect(page.getByText("Ticket claimed.")).toBeVisible();
  await page.getByRole("button", { name: "Record action" }).click();
  await page.locator("#action-form-description").fill("E2E lab-04 drill-down setup work.");
  await page.locator("#action-form-assignee").selectOption({ label: "E2E Lab04 E2E3 Staff" });
  await page.getByRole("button", { name: "Use current time" }).click();
  await page.getByRole("button", { name: "Create action" }).click();
  await expect(page.getByText("Action recorded.")).toBeVisible();
  await logout(page);

  // Requester dashboard: open card drills into the owned dataset only.
  await login(page, REQ_A);
  await page.goto("/dashboard");
  await expect(page.getByText("Open Tickets", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: /View open tickets/i }).click();
  await expect(page).toHaveURL(/\/my-tickets\?state=open/);
  // Wait for the destination content, not just the URL: SPA navigation
  // swaps the URL instantly while the dashboard is still mounted, so row
  // assertions would race the unmount (CI strict-violation, FIX-BUILD).
  await expect(page.getByRole("heading", { name: "My Tickets" })).toBeVisible();
  await expect(page.getByRole("link", { name: ticketA })).toBeVisible();
  await expect(page.getByText(ticketB)).toHaveCount(0);
  // Resolved drill-down lands on an empty owned set (never foreign rows).
  await page.goto("/dashboard");
  await page.getByRole("link", { name: /View resolved tickets/i }).click();
  await expect(page).toHaveURL(/\/my-tickets\?state=resolved/);
  await expect(page.getByRole("heading", { name: "My Tickets" })).toBeVisible();
  await expect(page.getByText(ticketB)).toHaveCount(0);
  await logout(page);

  // Staff dashboard: urgent/assigned/owned cards drill into exact datasets.
  await login(page, STAFF);
  await page.goto("/staff-dashboard");
  await expect(page.getByText("Owned by me")).toBeVisible();
  await page.getByRole("link", { name: /View urgent tickets/i }).click();
  await expect(page).toHaveURL(/itPriority=HIGH%2CCRITICAL|itPriority=HIGH,CRITICAL/);
  await expect(page.getByRole("heading", { name: "Ticket Queue" })).toBeVisible();
  await expect(page.getByRole("link", { name: ticketA })).toBeVisible();
  await page.goto("/staff-dashboard");
  await page.getByRole("link", { name: /View assigned tickets/i }).click();
  await expect(page).toHaveURL(/assignee=me/);
  await expect(page.getByRole("heading", { name: "Ticket Queue" })).toBeVisible();
  await expect(page.getByRole("link", { name: ticketA })).toBeVisible();
  await page.goto("/staff-dashboard");
  await page.getByRole("link", { name: /View owned tickets/i }).click();
  await expect(page).toHaveURL(/owner=me/);
  await expect(page.getByRole("heading", { name: "Ticket Queue" })).toBeVisible();
  await expect(page.getByRole("link", { name: ticketA })).toBeVisible();
  await logout(page);

  // Administrator sees the user-counts card on the same dashboard.
  await login(page, ADMIN);
  await page.goto("/staff-dashboard");
  await expect(page.getByText("User accounts")).toBeVisible();
  await expect(page.getByText("Active users:")).toBeVisible();

  expect(pageFaults).toEqual([]);
});
