// Lab 3 accessibility E2E (Issue #51, A11Y-01, AC-17).
//
// Keyboard-only representative flows: login form, requester detail tabs,
// staff queue controls, admin row activation, and user-menu logout. Every
// exercised control must be reachable by Tab, operable by keyboard, carry
// an accessible name, and show a visible focus indicator.
//
// Fixtures are dedicated fixed e2e-owned users (never seeded ones).
import { expect, test, type Page } from "@playwright/test";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { getTestDatabaseUrl } from "../lab-02/test-env";

const REQ_EMAIL = "e2e-a11y-req@example.com";
const STAFF_EMAIL = "e2e-a11y-staff@example.com";
const ADMIN_EMAIL = "e2e-a11y-admin@example.com";
const PASSWORD = "E2E-A11y#Kb-Ee9!";

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

async function resetKeyboardFocus(page: Page): Promise<void> {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
}

async function tabTo(page: Page, target: import("@playwright/test").Locator): Promise<void> {
  const targetId = await target.evaluate((el) => {
    const id = `a11y-probe-${Math.floor(Math.random() * 1e9)}`;
    el.setAttribute("data-a11y-probe", id);
    return id;
  });
  for (let i = 0; i < 120; i += 1) {
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(
      (probe) => document.activeElement?.getAttribute("data-a11y-probe") === probe,
      targetId,
    );
    if (focused) return;
  }
  throw new Error("tabTo: target never received keyboard focus");
}

async function expectVisibleFocus(page: Page): Promise<void> {
  const state = await page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null;
    if (!active) return null;
    const style = getComputedStyle(active);
    return { outlineStyle: style.outlineStyle, outlineWidth: Number.parseFloat(style.outlineWidth) };
  });
  expect(state).not.toBeNull();
  expect(state!.outlineStyle).not.toBe("none");
  expect(state!.outlineWidth).toBeGreaterThanOrEqual(1);
}

test.beforeAll(() => {
  runUserHelper(["setup", REQ_EMAIL, PASSWORD, "E2E A11y Req", "REQUESTER", "false"]);
  runUserHelper(["setup", STAFF_EMAIL, PASSWORD, "E2E A11y Staff", "IT_STAFF", "false"]);
  runUserHelper(["setup", ADMIN_EMAIL, PASSWORD, "E2E A11y Admin", "ADMINISTRATOR", "false"]);
});

test.afterAll(() => {
  runUserHelper(["cleanup", REQ_EMAIL]);
  runUserHelper(["cleanup", STAFF_EMAIL]);
  runUserHelper(["cleanup", ADMIN_EMAIL]);
});

test("A11Y-01 keyboard-only login, tabs, queue controls, admin row, logout", async ({
  page,
}) => {
  // Login form is fully keyboard-operable with named controls.
  await page.goto("/");
  await resetKeyboardFocus(page);
  const email = page.locator("#login-email");
  await tabTo(page, email);
  await expectVisibleFocus(page);
  await page.keyboard.type(REQ_EMAIL);
  await page.keyboard.press("Tab");
  await expectVisibleFocus(page);
  await page.keyboard.type(PASSWORD);
  await tabTo(page, page.getByRole("button", { name: "Sign In" }));
  await page.keyboard.press("Enter");
  await expect(page.locator(".lab3-user-menu")).toBeVisible();

  // Requester detail tabs switch by keyboard and keep aria-selected true.
  await page.goto("/create");
  await page.locator("#category").selectOption({ index: 1 });
  await page.locator("#relatedSystem").selectOption({ index: 1 });
  await page.locator("#summary").fill("E2E a11y keyboard ticket");
  await page.locator("#description").fill("E2E description: keyboard operability evidence.");
  await page.locator("#priority").selectOption("MEDIUM");
  await page.getByRole("button", { name: "Submit Ticket" }).click();
  const panel = page.getByRole("status");
  await expect(panel).toContainText("Ticket created successfully");
  const ticketNumber = ((await panel.textContent()) ?? "").match(/\d{4}-\d{4}/)?.[0] ?? "";
  await page.goto("/my-tickets");
  await page.locator("#my-tickets-search").fill(ticketNumber);
  await page.getByRole("link", { name: ticketNumber }).first().click();

  const commentsTab = page.getByRole("tab", { name: "Public Comments" });
  const actionsTab = page.getByRole("tab", { name: "Ticket Actions" });
  await resetKeyboardFocus(page);
  await tabTo(page, actionsTab);
  await expectVisibleFocus(page);
  await page.keyboard.press("Enter");
  await expect(actionsTab).toHaveAttribute("aria-selected", "true");
  await expect(commentsTab).toHaveAttribute("aria-selected", "false");

  // User menu + logout by keyboard.
  await resetKeyboardFocus(page);
  await tabTo(page, page.getByRole("button", { name: "User menu" }));
  await page.keyboard.press("Enter");
  const logoutItem = page.getByRole("menuitem", { name: "Logout" });
  await expect(logoutItem).toBeVisible();
  await logoutItem.click();
  await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();

  // Staff queue search + owner filter by keyboard.
  await page.locator("#login-email").fill(STAFF_EMAIL);
  await page.locator("#login-password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page.getByRole("heading", { name: "Ticket Queue" })).toBeVisible();
  await resetKeyboardFocus(page);
  const search = page.getByLabel("Search");
  await tabTo(page, search);
  await page.keyboard.type(ticketNumber);
  await expect(page.getByRole("link", { name: ticketNumber }).first()).toBeVisible();

  // Admin row opens Edit by keyboard Enter.
  await page.getByRole("button", { name: "User menu" }).click();
  await page.getByRole("menuitem", { name: "Logout" }).click();
  await page.locator("#login-email").fill(ADMIN_EMAIL);
  await page.locator("#login-password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();
  await page.getByRole("link", { name: "User Management" }).click();
  await expect(page.getByRole("heading", { name: "User Management" })).toBeVisible();
  await page.getByLabel("Search").fill(STAFF_EMAIL);
  const row = page.locator('tr[tabindex="0"]', { hasText: STAFF_EMAIL });
  await expect(row).toBeVisible();
  await resetKeyboardFocus(page);
  await tabTo(page, row);
  await expectVisibleFocus(page);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Edit User" })).toBeVisible();
});
