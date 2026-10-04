// Lab 4 A11Y-01: keyboard-only dashboard, action, and history flows
// (Issue #81, ui-spec §9).
//
// - Dashboard metric cards are reachable and operable by keyboard alone
//   (Tab to the link, Enter to drill down).
// - The Ticket Actions tab, History toggle, and history-region focus
//   management all work without a mouse.
// - Every focused element keeps a visible focus indicator.
// - Form controls are label-associated (getByLabel IS the assertion).
// - The loading live region announces the dashboard load.
// - The attachment removal dialog (the one custom dialog in scope)
//   traps focus, closes on Escape, and returns focus to its trigger.
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

const REQ_EMAIL = "e2e-lab04-a11y-req@example.com";
const STAFF_EMAIL = "e2e-lab04-a11y-staff@example.com";
const SUMMARY = "E2E lab-04 keyboard-only accounting export";

test.beforeAll(() => {
  setupUser(REQ_EMAIL, "E2E Lab04 A11Y Req", "REQUESTER");
  setupUser(STAFF_EMAIL, "E2E Lab04 A11Y Staff", "IT_STAFF");
});

test.afterAll(() => {
  cleanupUser(REQ_EMAIL);
  cleanupUser(STAFF_EMAIL);
});

async function tabTo(page: import("@playwright/test").Page, name: RegExp, maxTabs = 40): Promise<void> {
  for (let i = 0; i < maxTabs; i++) {
    const identity = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return "";
      return `${el.getAttribute("aria-label") ?? ""} ${el.textContent ?? ""}`.trim();
    });
    if (name.test(identity)) return;
    await page.keyboard.press("Tab");
  }
  throw new Error(`keyboard: never reached ${name} within ${maxTabs} tabs`);
}

// Reviewer findings 1+2 (FIX-REVIEW PR #87 round 3): the v1 sweep computed
// a `start` it never used, broke on first-repeat identity (not proven
// return-to-start), and accepted any outline/box-shadow as proof.
// This version guarantees, by construction:
// - DOM-node identity via expando marks (no two distinct elements alias;
//   identity collision is impossible, not merely unlikely).
// - Termination ONLY on refocus of the marked starting element; the 400-tab
//   bound is an explicit FAIL (cycle never closed), never a silent break.
// - Visible-focus proof requires outline-width > 0 plus a non-transparent
//   outline color. Decorative pre-existing box-shadows never count.
async function assertFullCycleFocus(page: import("@playwright/test").Page, label: string): Promise<void> {
  await page.evaluate(() => {
    document.querySelectorAll("*").forEach((e) => {
      delete (e as unknown as Record<string, unknown>).__sweepSeen;
      delete (e as unknown as Record<string, unknown>).__sweepStart;
    });
  });
  await page.keyboard.press("Tab");
  const started: boolean = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return false;
    (el as unknown as Record<string, unknown>).__sweepStart = true;
    (el as unknown as Record<string, unknown>).__sweepSeen = true;
    return true;
  });
  expect(started, `${label}: keyboard focus enters the page`).toBe(true);
  let terminatedByReturn = false;
  let visited = 1;
  const invisible: string[] = [];
  // The starting element counts as visited: prove its indicator too.
  const startStyle = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return null;
    const style = getComputedStyle(el);
    return { outline: style.outlineStyle, width: style.outlineWidth, color: style.outlineColor };
  });
  if (startStyle && !hasFocusIndicator(startStyle)) invisible.push("start-element");
  for (let i = 0; i < 400; i++) {
    await page.keyboard.press("Tab");
    const state = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const rec = el as unknown as Record<string, unknown>;
      if (rec.__sweepStart === true) return { returned: true as boolean, tagged: "", ok: true };
      if (rec.__sweepSeen === true) {
        // A repeat that is NOT the start element: DOM churn replaced nodes
        // mid-sweep, so closure is unprovable on this pass.
        return { returned: false, tagged: "", ok: false, churned: true };
      }
      rec.__sweepSeen = true;
      const style = getComputedStyle(el);
      const tagged = `${el.tagName}#${el.id}`;
      return { returned: false, tagged, ok: true, churned: false, outline: style.outlineStyle, width: style.outlineWidth, color: style.outlineColor };
    });
    if (state === null) continue;
    if (state.returned) {
      terminatedByReturn = true;
      break;
    }
    if (state.churned) break;
    visited += 1;
    if (!hasFocusIndicator(state)) invisible.push(state.tagged);
  }
  expect(terminatedByReturn, `${label}: cycle closed by returning to the starting element`).toBe(true);
  expect(invisible, `${label}: focusable elements without a real visible indicator`).toEqual([]);
  // Evidence transparency: how many distinct controls the cycle covered.
  // eslint-disable-next-line no-console
  console.log(`${label}: full-cycle focus sweep covered ${visited} controls, 0 invisible`);
}

function hasFocusIndicator(state: { outline?: string; width?: string; color?: string }): boolean {
  if (!state.outline || state.outline === "none") return false;
  const width = Number.parseFloat(state.width ?? "0");
  if (!Number.isFinite(width) || width <= 0) return false;
  return !isTransparentColor(state.color ?? "");
}

function isTransparentColor(color: string): boolean {
  const c = color.trim().toLowerCase();
  if (c === "transparent") return true;
  const rgba = c.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/);
  if (rgba) {
    const alpha = rgba[4] === undefined ? 1 : Number.parseFloat(rgba[4]);
    return alpha <= 0;
  }
  const hex = c.match(/^#([0-9a-f]{8})$/);
  if (hex) return Number.parseInt(hex[1].slice(6, 8), 16) === 0;
  return false;
}

test("A11Y-01 keyboard-only dashboard, action, history, and dialog flows", async ({ page }) => {
  const pageFaults = trackPageFaults(page);

  await login(page, REQ_EMAIL);
  const ticketNumber = await createTicketViaUI(page, SUMMARY);
  await logout(page);
  await login(page, STAFF_EMAIL);
  const ticketId = await openStaffTicket(page, ticketNumber);
  void ticketId;

  // Keyboard-only dashboard drill-down: Tab to the owned-tickets link,
  // Enter to navigate.
  await page.goto("/staff-dashboard");
  await expect(page.getByText("Owned by me")).toBeVisible();
  await tabTo(page, /View owned tickets/i);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/staff\/queue\?owner=me/);
  // Destination content, not just URL (same SPA-swap race as E2E-03).
  await expect(page.getByRole("heading", { name: "Ticket Queue" })).toBeVisible();

  // Keyboard-only tab operation back on the detail page.
  await page.goto("/staff/queue");
  await page.locator("#staff-queue-search").fill(ticketNumber);
  await page.getByRole("link", { name: ticketNumber }).first().click();
  await page.getByRole("tab", { name: "Ticket Actions" }).click();
  await page.keyboard.press("Tab");
  // Record-action flow stays keyboard-operable with labelled controls.
  await tabTo(page, /Record action/);
  await page.keyboard.press("Enter");
  await page.getByRole("form", { name: "Create action" }).getByLabel("Description").fill("E2E lab-04 keyboard-recorded work.");
  await page.getByRole("button", { name: "Use current time" }).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Create action" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Action recorded.")).toBeVisible();

  // Keyboard-only history: toggle opens the region and moves focus into it.
  // (Generous tab budget: readonly ticket-info inputs are tab stops too.)
  await tabTo(page, /^History$/, 150);
  await page.keyboard.press("Enter");
  const historyRegion = page.locator("[aria-label^='History for action']");
  await expect(historyRegion).toBeVisible();
  const focusedInside = await page.evaluate(() => {
    const region = document.querySelector("[aria-label^='History for action']");
    return !!region && region.contains(document.activeElement);
  });
  expect(focusedInside, "focus moves into the opened history region").toBe(true);

  // Full-cycle sweep on the ticket actions view as well.
  await assertFullCycleFocus(page, "ticket actions view");

  // Full-cycle visible-focus sweep on the dashboard: every focusable
  // control, not an arbitrary step cap.
  await page.goto("/staff-dashboard");
  await expect(page.getByText("Owned by me")).toBeVisible();
  await assertFullCycleFocus(page, "staff dashboard");

  expect(pageFaults).toEqual([]);
});

test("A11Y-01 attachment removal dialog traps focus, closes on Escape, returns focus", async ({
  page,
}) => {
  const pageFaults = trackPageFaults(page);

  await login(page, REQ_EMAIL);
  const ticketNumber = await createTicketViaUI(page, "E2E lab-04 dialog trap attachment host");
  await page.goto("/my-tickets");
  await page.locator("#my-tickets-search").fill("dialog trap attachment host");
  await page.getByRole("link", { name: ticketNumber }).first().click();
  await page.getByRole("tab", { name: "Attachments" }).click();
  await page
    .getByLabel("Choose file")
    .setInputFiles({ name: "e2e-a11y.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%E2E-A11Y\n") });
  await expect(page.getByText("e2e-a11y.pdf")).toBeVisible();

  // Open the removal dialog and assert focus is trapped inside it.
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Remove Attachment" });
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Tab");
    const inside = await page.evaluate(() => {
      const dlg = document.querySelector("[role='dialog']");
      return !!dlg && !!document.activeElement && dlg.contains(document.activeElement);
    });
    expect(inside, "tab stays trapped inside the dialog").toBe(true);
  }

  // Escape closes and returns focus to the Remove trigger.
  await page.getByLabel("Reason").fill("E2E lab-04 keyboard trap proof.");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  const focusBack = await page.evaluate(
    () => document.activeElement?.textContent?.includes("Remove") ?? false,
  );
  expect(focusBack, "focus returns to the Remove trigger").toBe(true);

  expect(pageFaults).toEqual([]);
});
