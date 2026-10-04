// Lab 4 VISUAL-01: responsive/visual evidence (Issue #81, ui-spec §8).
//
// Captures readable 1440/900/375 screenshots of all major Lab 4 screens
// into artifacts/lab-04/screenshots/{staff-dashboard,requester-dashboard,
// actions-taken}/ (committed submission evidence) and asserts no horizontal
// overflow at every captured viewport plus the §10 checklist states.
//
// Fixtures are DEDICATED fixed e2e-owned users (never seeded ones).
import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import {
  checkNoOverflow,
  cleanupUser,
  createTicketViaUI,
  login,
  logout,
  setupUser,
  trackPageFaults,
} from "./helpers";

const SHOTS = path.resolve("artifacts", "lab-04", "screenshots");

const REQ_EMAIL = "e2e-lab04-vis-req@example.com";
const STAFF_EMAIL = "e2e-lab04-vis-staff@example.com";
const ADMIN_EMAIL = "e2e-lab04-vis-admin@example.com";
const FRESH_EMAIL = "e2e-lab04-vis-fresh@example.com";
const SUMMARY = "E2E lab-04 visual evidence plotter jam";

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 900, height: 900 },
  { name: "mobile", width: 375, height: 812 },
] as const;

test.beforeAll(() => {
  setupUser(REQ_EMAIL, "E2E Lab04 Vis Req", "REQUESTER");
  setupUser(STAFF_EMAIL, "E2E Lab04 Vis Staff", "IT_STAFF");
  setupUser(ADMIN_EMAIL, "E2E Lab04 Vis Admin", "ADMINISTRATOR");
  setupUser(FRESH_EMAIL, "E2E Lab04 Vis Fresh", "REQUESTER");
});

test.afterAll(() => {
  cleanupUser(REQ_EMAIL);
  cleanupUser(STAFF_EMAIL);
  cleanupUser(ADMIN_EMAIL);
  cleanupUser(FRESH_EMAIL);
});

async function shot(page: Page, dir: string, name: string, label: string): Promise<void> {
  await checkNoOverflow(page, `${label} @ ${name}`);
  await page.screenshot({ path: path.join(SHOTS, dir, `${name}.png`) });
}

test("VISUAL-01 requester dashboard populated and empty states", async ({ page }) => {
  const pageFaults = trackPageFaults(page);
  await login(page, REQ_EMAIL);
  await createTicketViaUI(page, SUMMARY);

  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto("/dashboard");
    await expect(page.getByText("Open Tickets", { exact: true })).toBeVisible();
    await shot(page, "requester-dashboard", vp.name, "requester dashboard");
  }
  await logout(page);

  // Zero-ticket requester: zeros plus guidance, never blank.
  await login(page, FRESH_EMAIL);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/dashboard");
  await expect(page.getByText(/no tickets yet/i)).toBeVisible();
  await shot(page, "requester-dashboard", "empty", "requester dashboard empty");

  expect(pageFaults).toEqual([]);
});

test("VISUAL-01 staff dashboard plus admin counts card", async ({ page }) => {
  const pageFaults = trackPageFaults(page);
  await login(page, STAFF_EMAIL);
  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto("/staff-dashboard");
    await expect(page.getByText("Owned by me")).toBeVisible();
    await shot(page, "staff-dashboard", vp.name, "staff dashboard");
  }
  await logout(page);

  await login(page, ADMIN_EMAIL);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/staff-dashboard");
  await expect(page.getByText("User accounts")).toBeVisible();
  await shot(page, "staff-dashboard", "admin", "staff dashboard admin counts");

  expect(pageFaults).toEqual([]);
});

test("VISUAL-01 drill-down destinations match their metric datasets (D-81-05)", async ({
  page,
}) => {
  const pageFaults = trackPageFaults(page);

  await login(page, REQ_EMAIL);
  const drillNumber = await createTicketViaUI(page, "E2E lab-04 drill-down target capture");
  await logout(page);

  await login(page, STAFF_EMAIL);
  await page.goto("/staff/queue");
  await expect(page.getByRole("heading", { name: "Ticket Queue" })).toBeVisible();
  await page.locator("#staff-queue-search").fill(drillNumber);
  await page.getByRole("link", { name: drillNumber }).first().click();
  await expect(page.getByRole("heading", { name: /Ticket \d{4}-\d{4}/ })).toBeVisible();
  await page.getByRole("tab", { name: "Ticket Actions" }).click();
  await page.getByRole("button", { name: "Claim Ticket" }).click();
  await expect(page.getByText("Ticket claimed.")).toBeVisible();
  await page.getByRole("button", { name: "Record action" }).click();
  await page.locator("#action-form-description").fill("E2E lab-04 drill-down target setup.");
  await page.locator("#action-form-assignee").selectOption({ label: "E2E Lab04 Vis Staff" });
  await page.getByRole("button", { name: "Use current time" }).click();
  await page.getByRole("button", { name: "Create action" }).click();
  await expect(page.getByText("Action recorded.")).toBeVisible();

  // Staff drill-down destination: the exact assignedToMe dataset.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/staff/queue?assignee=me&state=open");
  await expect(page.getByRole("link", { name: drillNumber })).toBeVisible();
  await shot(page, "staff-dashboard", "drilldown-assigned", "staff drill-down destination");

  // Requester drill-down destination: the exact open dataset.
  await logout(page);
  await login(page, REQ_EMAIL);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/my-tickets?state=open");
  await expect(page.getByRole("link", { name: drillNumber })).toBeVisible();
  await shot(page, "requester-dashboard", "drilldown-open", "requester drill-down destination");

  expect(pageFaults).toEqual([]);
});

test("VISUAL-01 actions-taken staff view, requester read-only view, gate-blocked state", async ({
  page,
}) => {
  const pageFaults = trackPageFaults(page);
  page.on("dialog", (dialog) => void dialog.accept());

  await login(page, REQ_EMAIL);
  const visNumber = await createTicketViaUI(page, SUMMARY);
  await logout(page);

  await login(page, STAFF_EMAIL);
  await page.goto("/staff/queue");
  await expect(page.getByRole("heading", { name: "Ticket Queue" })).toBeVisible();
  await page.locator("#staff-queue-search").fill(visNumber);
  await page.getByRole("link", { name: visNumber }).first().click();
  await expect(page.getByRole("heading", { name: /Ticket \d{4}-\d{4}/ })).toBeVisible();
  await page.getByRole("tab", { name: "Ticket Actions" }).click();
  await page.getByRole("button", { name: "Claim Ticket" }).click();
  await expect(page.getByText("Ticket claimed.")).toBeVisible();
  await page.getByRole("button", { name: "Record action" }).click();
  await page.locator("#action-form-description").fill("E2E lab-04 visual setup action.");
  await page.getByRole("button", { name: "Use current time" }).click();
  await page.getByRole("button", { name: "Create action" }).click();
  await expect(page.getByText("Action recorded.")).toBeVisible();

  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await shot(page, "actions-taken", vp.name, "actions-taken staff view");
  }

  // Gate-blocked state with the blocker copy visible.
  await page.locator("#staff-detail-status").selectOption("IN_PROGRESS");
  await page.getByRole("button", { name: "Update Status" }).click();
  await expect(page.getByText("Status updated.")).toBeVisible();
  await page.locator("#staff-detail-status").selectOption("RESOLVED");
  await page.getByRole("button", { name: "Update Status" }).click();
  await expect(page.getByText("No completed work")).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  await shot(page, "actions-taken", "gate-blocked", "gate-blocked copy");
  await logout(page);

  // Requester read-only actions view of the same ticket.
  await login(page, REQ_EMAIL);
  await page.goto("/my-tickets");
  await page.locator("#my-tickets-search").fill(visNumber);
  await page.getByRole("link", { name: visNumber }).first().click();
  await page.getByRole("tab", { name: "Ticket Actions" }).click();
  await expect(page.getByRole("button", { name: "History" }).first()).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  await shot(page, "actions-taken", "requester-readonly", "actions-taken requester view");

  expect(pageFaults).toEqual([]);
});
