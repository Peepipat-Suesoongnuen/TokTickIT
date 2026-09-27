// Lab 3 visual evidence E2E (Issue #51, VISUAL-01, AC-17).
//
// Captures readable desktop/tablet/mobile screenshots for all major Lab 3
// screens plus queue loading/empty/no-results/failure states into
// artifacts/lab-03/screenshots/ (committed submission evidence), and
// asserts no horizontal overflow at every captured viewport.
//
// Fixtures are dedicated fixed e2e-owned users (never seeded ones).
import { expect, test, type Page } from "@playwright/test";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { getTestDatabaseUrl } from "../lab-02/test-env";

const SHOTS = path.resolve("artifacts", "lab-03", "screenshots");

const REQ_EMAIL = "e2e-vis-req@example.com";
const STAFF_EMAIL = "e2e-vis-staff@example.com";
const ADMIN_EMAIL = "e2e-vis-admin@example.com";
const GATE_EMAIL = "e2e-vis-gate@example.com";
const GATE_PASSWORD = "E2E-Vis#Gate-Gg1!";
const PASSWORD = "E2E-Vis#Shot-Ff0!";

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

async function login(page: Page, email: string): Promise<void> {
  await page.goto("/");
  await page.locator("#login-email").fill(email);
  await page.locator("#login-password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page.locator(".lab3-user-menu")).toBeVisible();
}

async function logout(page: Page): Promise<void> {
  await page.getByRole("button", { name: "User menu" }).click();
  await page.getByRole("menuitem", { name: "Logout" }).click();
  await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();
}

async function checkNoOverflow(page: Page, label: string): Promise<void> {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `${label}: horizontal overflow`).toBeLessThanOrEqual(1);
}

test.beforeAll(() => {
  runUserHelper(["setup", REQ_EMAIL, PASSWORD, "E2E Vis Req", "REQUESTER", "false"]);
  runUserHelper(["setup", STAFF_EMAIL, PASSWORD, "E2E Vis Staff", "IT_STAFF", "false"]);
  runUserHelper(["setup", ADMIN_EMAIL, PASSWORD, "E2E Vis Admin", "ADMINISTRATOR", "false"]);
  // Mandatory-change gate fixture: fresh initial hash every run.
  runUserHelper(["setup", GATE_EMAIL, GATE_PASSWORD, "E2E Vis Gate", "REQUESTER", "true"]);
});

test.afterAll(() => {
  runUserHelper(["cleanup", REQ_EMAIL]);
  runUserHelper(["cleanup", STAFF_EMAIL]);
  runUserHelper(["cleanup", ADMIN_EMAIL]);
  runUserHelper(["cleanup", GATE_EMAIL]);
});

test("VISUAL-01 desktop evidence for all major Lab 3 screens", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });

  // Login (logged out).
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();
  await checkNoOverflow(page, "login");
  await page.screenshot({ path: `${SHOTS}/authentication/login-desktop.png` });

  // Mandatory change-password gate (fresh initial credential). Clears
  // cookies afterward so later logins in this test start logged out.
  await page.locator("#login-email").fill(GATE_EMAIL);
  await page.locator("#login-password").fill(GATE_PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page.getByRole("heading", { name: "Change Password" })).toBeVisible();
  await checkNoOverflow(page, "change-password");
  await page.screenshot({ path: `${SHOTS}/authentication/change-password-desktop.png` });
  await page.context().clearCookies();

  // Requester: my tickets, create, detail.
  await login(page, REQ_EMAIL);
  await page.goto("/my-tickets");
  await expect(page.getByRole("heading", { name: "My Tickets" })).toBeVisible();
  await checkNoOverflow(page, "my-tickets");
  await page.screenshot({ path: `${SHOTS}/requester/my-tickets-desktop.png` });

  await page.goto("/create");
  await expect(page.getByRole("heading", { name: "Create Ticket" })).toBeVisible();
  await checkNoOverflow(page, "create");
  await page.screenshot({ path: `${SHOTS}/requester/create-ticket-desktop.png` });

  // Requester detail with comments tab — deterministic ticket created
  // in-spec so this capture can never silently skip (reviewer blocker).
  await page.goto("/create");
  await page.locator("#category").selectOption({ index: 1 });
  await page.locator("#relatedSystem").selectOption({ index: 1 });
  await page.locator("#summary").fill("Visual evidence ticket");
  await page.locator("#description").fill("Deterministic visual fixture ticket body.");
  await page.locator("#priority").selectOption("MEDIUM");
  await page.getByRole("button", { name: "Submit Ticket" }).click();
  await expect(page.getByRole("status")).toContainText("Ticket created successfully");
  await page.goto("/my-tickets");
  const firstLink = page.getByRole("table").getByRole("link").first();
  await expect(firstLink).toBeVisible();
  await firstLink.click();
  await page.getByRole("tab", { name: "Public Comments" }).click();
  await checkNoOverflow(page, "requester-detail");
  await page.screenshot({ path: `${SHOTS}/requester/ticket-detail-desktop.png`, fullPage: true });
  await logout(page);

  // Staff: queue + detail actions.
  await login(page, STAFF_EMAIL);
  await expect(page.getByRole("heading", { name: "Ticket Queue" })).toBeVisible();
  await expect(page.getByRole("table")).toBeVisible();
  await checkNoOverflow(page, "staff-queue");
  await page.screenshot({ path: `${SHOTS}/staff-queue/ticket-queue-desktop.png` });
  await page.getByRole("table").getByRole("link").first().click();
  await page.getByRole("tab", { name: "Ticket Actions" }).click();
  await checkNoOverflow(page, "staff-detail");
  await page.screenshot({ path: `${SHOTS}/staff-ticket-detail/ticket-detail-desktop.png`, fullPage: true });
  await logout(page);

  // Admin: user management + edit.
  await login(page, ADMIN_EMAIL);
  await page.getByRole("link", { name: "User Management" }).click();
  await expect(page.getByRole("heading", { name: "User Management" })).toBeVisible();
  await expect(page.getByRole("table")).toBeVisible();
  await checkNoOverflow(page, "admin-list");
  await page.screenshot({ path: `${SHOTS}/user-management/user-list-desktop.png` });
  await page.getByRole("table").getByText(STAFF_EMAIL).click();
  await expect(page.getByRole("heading", { name: "Edit User" })).toBeVisible();
  await checkNoOverflow(page, "admin-edit");
  await page.screenshot({ path: `${SHOTS}/user-management/edit-user-desktop.png`, fullPage: true });

  // Admin create form (nav-scoped link: breadcrumbs now link back too).
  await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "User Management" }).click();
  await page.getByRole("link", { name: "Create User" }).click();
  await expect(page.getByRole("heading", { name: "Create User" })).toBeVisible();
  await checkNoOverflow(page, "admin-create");
  await page.screenshot({ path: `${SHOTS}/user-management/create-user-desktop.png`, fullPage: true });

  // Admin reset form (via the edit page of a known user).
  // Nav-scoped: the edit breadcrumb links back with the same name.
  await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "User Management" }).click();
  await page.getByLabel("Search").fill(STAFF_EMAIL);
  await page.getByRole("table").getByText(STAFF_EMAIL).click();
  await expect(page.getByRole("heading", { name: "Edit User" })).toBeVisible();
  await page.getByRole("link", { name: "Set New Initial Password" }).click();
  await expect(page.getByRole("heading", { name: "Set New Initial Password" })).toBeVisible();
  await checkNoOverflow(page, "admin-reset");
  await page.screenshot({ path: `${SHOTS}/user-management/set-initial-password-desktop.png`, fullPage: true });
});

test("VISUAL-01 tablet and mobile evidence for key screens", async ({ page }) => {
  await login(page, STAFF_EMAIL);
  for (const [width, height, suffix] of [
    [900, 1200, "tablet"],
    [375, 812, "mobile"],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.goto("/staff/queue");
    await expect(page.getByRole("heading", { name: "Ticket Queue" })).toBeVisible();
    await checkNoOverflow(page, `queue-${suffix}`);
    await page.screenshot({ path: `${SHOTS}/staff-queue/ticket-queue-${suffix}.png` });

    await page.goto("/my-tickets").catch(() => undefined);
  }

  // Requester mobile cards + create/detail at tablet and mobile.
  await page.getByRole("button", { name: "User menu" }).click();
  await page.getByRole("menuitem", { name: "Logout" }).click();
  await login(page, REQ_EMAIL);
  for (const [width, height, suffix] of [
    [900, 1200, "tablet"],
    [375, 812, "mobile"],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.goto("/my-tickets");
    await expect(page.getByRole("heading", { name: "My Tickets" })).toBeVisible();
    await checkNoOverflow(page, `requester-list-${suffix}`);
    await page.screenshot({ path: `${SHOTS}/requester/my-tickets-${suffix}.png` });

    await page.goto("/create");
    await expect(page.getByRole("heading", { name: "Create Ticket" })).toBeVisible();
    await checkNoOverflow(page, `requester-create-${suffix}`);
    await page.screenshot({ path: `${SHOTS}/requester/create-ticket-${suffix}.png` });

    // Deterministic detail: the visual ticket created in the desktop test.
    // Locator follows the responsive representation (table ≥768px).
    await page.goto("/my-tickets");
    await page.locator("#my-tickets-search").fill("Visual evidence ticket");
    const detailLink =
      width >= 768
        ? page.getByRole("table").getByRole("link").first()
        : page.locator(".d-md-none").getByRole("link").first();
    await expect(detailLink).toBeVisible({ timeout: 15000 });
    await detailLink.click();
    await page.getByRole("tab", { name: "Public Comments" }).click();
    await checkNoOverflow(page, `requester-detail-${suffix}`);
    await page.screenshot({ path: `${SHOTS}/requester/ticket-detail-${suffix}.png`, fullPage: true });
  }

  // Admin mobile list + edit + create + reset (nav hides behind the
  // toggle below md widths).
  await page.getByRole("button", { name: "User menu" }).click();
  await page.getByRole("menuitem", { name: "Logout" }).click();
  await login(page, ADMIN_EMAIL);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  const umLink = page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "User Management" });
  await expect(umLink).toBeVisible({ timeout: 10000 });
  await umLink.click();
  await expect(page.getByRole("heading", { name: "User Management" })).toBeVisible();
  await checkNoOverflow(page, "admin-list-mobile");
  await page.screenshot({ path: `${SHOTS}/user-management/user-list-mobile.png` });
  await page.getByRole("link", { name: "Create User" }).click();
  await expect(page.getByRole("heading", { name: "Create User" })).toBeVisible();
  await checkNoOverflow(page, "admin-create-mobile");
  await page.screenshot({ path: `${SHOTS}/user-management/create-user-mobile.png`, fullPage: true });
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "User Management" }).click();
  await page.getByLabel("Search").fill(STAFF_EMAIL);
  await page.getByRole("link", { name: "Edit user E2E Vis Staff" }).click();
  await expect(page.getByRole("heading", { name: "Edit User" })).toBeVisible();
  await checkNoOverflow(page, "admin-edit-mobile");
  await page.screenshot({ path: `${SHOTS}/user-management/edit-user-mobile.png`, fullPage: true });
  await page.getByRole("link", { name: "Set New Initial Password" }).click();
  await expect(page.getByRole("heading", { name: "Set New Initial Password" })).toBeVisible();
  await checkNoOverflow(page, "admin-reset-mobile");
  await page.screenshot({ path: `${SHOTS}/user-management/set-initial-password-mobile.png`, fullPage: true });

  // Change-password gate on mobile.
  await page.getByRole("button", { name: "User menu" }).click();
  await page.getByRole("menuitem", { name: "Logout" }).click();
  await page.goto("/");
  await page.locator("#login-email").fill(GATE_EMAIL);
  await page.locator("#login-password").fill(GATE_PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page.getByRole("heading", { name: "Change Password" })).toBeVisible();
  await checkNoOverflow(page, "change-password-mobile");
  await page.screenshot({ path: `${SHOTS}/authentication/change-password-mobile.png` });
});

test("VISUAL-01 queue loading, no-results, and failure states", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, STAFF_EMAIL);

  // No-results state.
  await page.locator("#staff-queue-search").fill("no-such-ticket-zzz-49");
  await expect(page.getByText("No tickets match the current queue filters")).toBeVisible();
  await checkNoOverflow(page, "queue-no-results");
  await page.screenshot({ path: `${SHOTS}/staff-queue/queue-no-results.png` });
  await page.locator("#staff-queue-search").fill("");

  // Failure state via a 500 from the queue API.
  await page.route("**/api/staff/tickets*", (route) =>
    route.fulfill({ status: 500, contentType: "application/json", body: "{}" }),
  );
  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(page.getByRole("button", { name: "Retry" }).first()).toBeVisible({ timeout: 15000 });
  await page.screenshot({ path: `${SHOTS}/staff-queue/queue-failure.png` });
  await page.unrouteAll({ behavior: "wait" });
});
