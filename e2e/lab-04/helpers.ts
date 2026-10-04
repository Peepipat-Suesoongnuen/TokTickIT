// Lab 4 E2E shared helpers (Issues #81, E2E-01–03, A11Y-01, VISUAL-01).
//
// Mirrors the proven e2e/lab-03 conventions: dedicated fixed e2e-owned users
// (never seeded ones) via the shared e2e-user.ts helper, role-based locators,
// condition-based waits (never fixed sleeps for assertions), and committed
// screenshot evidence under artifacts/lab-04/.
import { expect, type Page } from "@playwright/test";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { getTestDatabaseUrl } from "../lab-02/test-env";

export const E2E_PASSWORD = "E2E-Lab04#Fix-Gg7!";

export function runUserHelper(args: string[]): void {
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

export function setupUser(email: string, name: string, role: "REQUESTER" | "IT_STAFF" | "ADMINISTRATOR"): void {
  runUserHelper(["setup", email, E2E_PASSWORD, name, role, "false"]);
}

export function cleanupUser(email: string): void {
  runUserHelper(["cleanup", email]);
}

export async function login(page: Page, email: string): Promise<void> {
  await page.goto("/");
  // Idempotent entry: a previous session in this context lands directly
  // in the workspace (no login form). Log out first so every login starts
  // from the same logged-out state.
  await expect(page.locator(".lab3-user-menu, #login-email").first()).toBeVisible();
  if ((await page.locator(".lab3-user-menu").count()) > 0) {
    await logout(page);
  }
  await page.locator("#login-email").fill(email);
  await page.locator("#login-password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page.locator(".lab3-user-menu")).toBeVisible();
}

export async function logout(page: Page): Promise<void> {
  await page.getByRole("button", { name: "User menu" }).click();
  await page.getByRole("menuitem", { name: "Logout" }).click();
  await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();
}

// Fatal page-issue tracking (Issue #81 polish: console-error-free).
// Installs listeners; the test asserts the collected faults are empty at
// the end. ONLY uncaught JS exceptions and network-level failures are
// tracked: the browser also logs "Failed to load resource" lines for HTTP
// error statuses, but expected-failure API calls (409 gate blocks, 401
// session races) legitimately return those statuses, so console text is
// not a fault signal in this app. Call BEFORE navigation.
export function trackPageFaults(page: Page): string[] {
  const faults: string[] = [];
  page.on("pageerror", (err) => {
    faults.push(`uncaught: ${err.message}`);
  });
  page.on("requestfailed", (req) => {
    // Known-benign: the logout POST is routinely aborted by the
    // immediately following navigation to the login screen, while logout
    // itself demonstrably succeeds (Sign In renders; next login works).
    // Everything else is a genuine fault signal.
    if (
      req.method() === "POST" &&
      req.url().endsWith("/api/auth/logout") &&
      req.failure()?.errorText === "net::ERR_ABORTED"
    ) {
      return;
    }
    faults.push(`${req.method()} ${req.url()} — ${req.failure()?.errorText ?? "failed"}`);
  });
  return faults;
}

export async function checkNoOverflow(page: Page, label: string): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `${label}: horizontal overflow`).toBeLessThanOrEqual(1);
}

// Creates a ticket through the requester UI and returns its ticket number.
// Caller must already be logged in as a Requester.
export async function createTicketViaUI(page: Page, summary: string): Promise<string> {
  await page.goto("/create");
  await page.locator("#category").selectOption({ index: 1 });
  await page.locator("#relatedSystem").selectOption({ index: 1 });
  await page.locator("#summary").fill(summary);
  await page.locator("#description").fill(`E2E lab-04 description for: ${summary}`);
  await page.locator("#priority").selectOption("HIGH");
  await page.getByRole("button", { name: "Submit Ticket" }).click();
  const successPanel = page.getByRole("status");
  await expect(successPanel).toContainText("Ticket created successfully");
  const ticketNumber = ((await successPanel.textContent()) ?? "").match(/\d{4}-\d{4}/)?.[0] ?? "";
  expect(ticketNumber).not.toBe("");
  return ticketNumber;
}

// Opens a staff ticket detail by queue search; returns the numeric ticket id.
export async function openStaffTicket(page: Page, ticketNumber: string): Promise<number> {
  await page.goto("/staff/queue");
  await expect(page.getByRole("heading", { name: "Ticket Queue" })).toBeVisible();
  await page.locator("#staff-queue-search").fill(ticketNumber);
  const rowLink = page.getByRole("link", { name: ticketNumber }).first();
  await expect(rowLink).toBeVisible();
  await rowLink.click();
  await expect(page.getByText(`Ticket ${ticketNumber}`)).toBeVisible();
  const id = Number((page.url().match(/(\d+)$/) ?? [])[1]);
  expect(Number.isInteger(id) && id > 0).toBe(true);
  return id;
}
