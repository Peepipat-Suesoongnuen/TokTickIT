import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import path from "node:path";
import {
  E2E_REQUESTER_B_EMAIL,
  E2E_REQUESTER_EMAIL,
  E2E_REQUESTER_NAME,
  LAB02_INITIAL_PASSWORD,
  ensureApiAuth,
  loginAs,
  logout,
} from "./auth-helper";

const API_URL = "http://127.0.0.1:3100";

type Reference = { id: number; name: string };
type Ticket = { id: number; ticketNumber: string };

const unique = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

async function getReferences(request: APIRequestContext, email: string = E2E_REQUESTER_EMAIL) {
  // Issue #45 (PR #58 review): reference-data routes are session-only —
  // `requesterId` is not accepted (unknown query parameter → 400).
  // Issue #46: ownership is session-derived — the API jar is authenticated
  // as the given dedicated e2e user before reading.
  await ensureApiAuth(request, email, LAB02_INITIAL_PASSWORD);
  const [categoriesResponse, systemsResponse] = await Promise.all([
    request.get(`${API_URL}/api/categories`),
    request.get(`${API_URL}/api/related-systems`),
  ]);
  expect(categoriesResponse.ok()).toBeTruthy();
  expect(systemsResponse.ok()).toBeTruthy();
  return {
    categories: (await categoriesResponse.json()) as Reference[],
    systems: (await systemsResponse.json()) as Reference[],
  };
}

async function createTicketViaApi(
  request: APIRequestContext,
  summary: string,
  email: string = E2E_REQUESTER_EMAIL,
): Promise<Ticket> {
  // Issue #46: session-derived owner — no requesterId in the body (→ 400
  // "Unknown parameter." if sent). The jar is authenticated as the owner.
  const { categories, systems } = await getReferences(request, email);
  const response = await request.post(`${API_URL}/api/tickets`, {
    data: {
      categoryId: categories[0].id,
      relatedSystemId: systems[0].id,
      summary,
      description: `Issue 11 E2E description for ${summary}`,
      requestedPriority: "MEDIUM",
    },
  });
  expect(response.status()).toBe(201);
  return response.json();
}

// Select-then-verify with one retry: on slow runners the option selection can
// desync from React state (proven by CI toHaveValue "" after a completed
// selectOption). Retrying the pair self-heals transient desyncs; a persistent
// mismatch still fails loudly with Expected/Received instead of a late
// timeout at submit.
async function selectAndVerify(page: Page, label: string, value: string): Promise<void> {
  const field = page.getByLabel(label);
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    await field.selectOption(value);
    try {
      await expect(field).toHaveValue(value, { timeout: 5000 });
      return;
    } catch (err) {
      if (attempt === 2) throw err;
    }
  }
}

async function assertNoHorizontalPageScroll(page: Page) {
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
}

async function assertNoHorizontalTableWrapperScroll(page: Page) {
  const wrapper = page.locator(".table-responsive:visible");
  await expect(wrapper).toHaveCount(1);
  const dimensions = await wrapper.evaluate((element) => ({
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
}

async function expectVisibleExactText(page: Page, text: string) {
  await expect
    .poll(async () => {
      const matches = await page.getByText(text, { exact: true }).all();
      for (const match of matches) {
        if (await match.isVisible()) return true;
      }
      return false;
    })
    .toBe(true);
}

function readOnlyField(page: Page, label: string) {
  return page.locator("label", { hasText: label }).locator("..").locator("input, textarea");
}

test("E2E-01 select requester -> create -> search -> open detail", async ({ page, request }) => {
  const { categories, systems } = await getReferences(request);
  const marker = `E2E01-${unique()}`;
  const summary = `Printer issue ${marker}`;

  // Issue #46: authenticate-first as the dedicated e2e owner (selector deleted).
  await loginAs(page, E2E_REQUESTER_EMAIL, LAB02_INITIAL_PASSWORD);
  await page.getByRole("navigation").getByRole("link", { name: "Create Ticket" }).click();
  await selectAndVerify(page, "Category", String(categories[0].id));
  await selectAndVerify(page, "Related System", String(systems[0].id));
  await selectAndVerify(page, "Requested Priority", "HIGH");
  await page.getByLabel("Summary").fill(summary);
  await page.getByLabel("Description").fill(`The printer cannot complete a job for marker ${marker}.`);
  await page.getByRole("button", { name: "Submit Ticket" }).click();

  const ticketNumberText = page.getByText(/Official Ticket Number:/);
  await expect(ticketNumberText).toBeVisible({ timeout: 10_000 });
  const ticketNumber = (await ticketNumberText.locator("strong").textContent())?.trim();
  expect(ticketNumber).toMatch(/^\d{4}-\d{4}$/);

  await page.getByRole("link", { name: "View My Tickets" }).click();
  await page.getByLabel("Search", { exact: true }).fill(ticketNumber!);
  const ticketRow = page.locator("tr", { hasText: summary });
  await expect(ticketRow).toContainText(ticketNumber!);
  await ticketRow.getByRole("link", { name: ticketNumber! }).click();

  await expect(readOnlyField(page, "Ticket Number")).toHaveValue(ticketNumber!);
  await expect(readOnlyField(page, "Summary")).toHaveValue(summary);
  // Issue #46: Requester is the session identity, not a selected row.
  await expect(readOnlyField(page, "Requester")).toHaveValue(E2E_REQUESTER_NAME);
});

test("E2E-02 requester B cannot open requester A ticket by direct URL", async ({ page, request }) => {
  // Issue #46: two dedicated e2e owners — ticket A is created under A's
  // session; the UI logs in as B and must get the safe 404.
  const ticketA = await createTicketViaApi(request, `A-owned-${unique()}`, E2E_REQUESTER_EMAIL);

  await loginAs(page, E2E_REQUESTER_B_EMAIL, LAB02_INITIAL_PASSWORD);
  await page.goto(`/tickets/${ticketA.id}`);
  await expect(page.getByText("Ticket not found", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to My Tickets" })).toBeVisible();
});

test("E2E-03 removal blocks blank reason then preserves removed metadata", async ({ page, request }) => {
  // Issue #46: ticket + upload are owned by the dedicated e2e session
  // (no requesterId query/body — rejected as "Unknown parameter.").
  const ticket = await createTicketViaApi(request, `Attachment-${unique()}`, E2E_REQUESTER_EMAIL);
  const filename = `issue11-${unique()}.pdf`;
  const upload = await request.post(`${API_URL}/api/tickets/${ticket.id}/attachments`, {
    multipart: {
      file: {
        name: filename,
        mimeType: "application/pdf",
        buffer: Buffer.from("%PDF-1.4\nIssue 11 E2E fixture\n%%EOF"),
      },
    },
  });
  expect(upload.status()).toBe(201);

  await loginAs(page, E2E_REQUESTER_EMAIL, LAB02_INITIAL_PASSWORD);
  await page.goto(`/tickets/${ticket.id}`);
  // Issue #49: attachments live under the Attachments tab.
  await page.getByRole("tab", { name: "Attachments" }).click();
  const attachmentRow = page.locator("li", { hasText: filename });
  await attachmentRow.getByRole("button", { name: "Remove" }).click();

  const confirm = page.getByRole("button", { name: "Confirm Removal" });
  await expect(confirm).toBeDisabled();
  await page.getByLabel("Reason").fill("Duplicate diagnostic attachment");
  await expect(confirm).toBeEnabled();
  await confirm.click();

  await expect(attachmentRow).toContainText("Reason: Duplicate diagnostic attachment");
  await expect(attachmentRow.getByRole("button", { name: "Download" })).toHaveCount(0);
});

test("E2E-04 two-user authenticated flow isolates owned tickets without leakage", async ({
  page,
  request,
}) => {
  // Issue #46: E2E-04 rewritten — the Change Requester button is deleted, so
  // isolation is proven by two real logins: A sees only A's tickets, B sees
  // only B's tickets and gets the safe 404 on A's ticket URL.
  const summaryA = `Requester-A-${unique()}`;
  const summaryB = `Requester-B-${unique()}`;
  const ticketA = await createTicketViaApi(request, summaryA, E2E_REQUESTER_EMAIL);
  await createTicketViaApi(request, summaryB, E2E_REQUESTER_B_EMAIL);

  await loginAs(page, E2E_REQUESTER_EMAIL, LAB02_INITIAL_PASSWORD);
  await page.getByRole("link", { name: "My Tickets" }).click();
  await expectVisibleExactText(page, summaryA);
  await expect(page.getByText(summaryB, { exact: true })).toHaveCount(0);

  await logout(page);
  await loginAs(page, E2E_REQUESTER_B_EMAIL, LAB02_INITIAL_PASSWORD);
  await page.getByRole("link", { name: "My Tickets" }).click();
  await expectVisibleExactText(page, summaryB);
  await expect(page.getByText(summaryA, { exact: true })).toHaveCount(0);

  await page.goto(`/tickets/${ticketA.id}`);
  await expect(page.getByText("Ticket not found", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to My Tickets" })).toBeVisible();
});

test("E2E-05 captures responsive evidence at 1440 / 900 / 375 widths", async ({ page, request }) => {
  const summary = `Responsive-${unique()}`;
  // Issue #46: created under the dedicated e2e session (no requesterId).
  const ticket = await createTicketViaApi(request, summary, E2E_REQUESTER_EMAIL);

  await loginAs(page, E2E_REQUESTER_EMAIL, LAB02_INITIAL_PASSWORD);
  await page.goto("/");
  await page.setViewportSize({ width: 1440, height: 900 });
  // Issue #46: the requester selector is deleted — the authenticated landing
  // is My Tickets (root redirects there). Captured at the legacy path to
  // preserve the artifact contract.
  await expect(page.getByRole("heading", { name: "My Tickets" })).toBeVisible();
  await assertNoHorizontalPageScroll(page);
  await page.screenshot({
    path: path.join("artifacts", "lab-02", "screenshots", "requester-selection", "desktop.png"),
    fullPage: true,
  });

  const viewports = [
    { name: "desktop", width: 1440, height: 900 },
    { name: "tablet", width: 900, height: 900 },
    { name: "mobile", width: 375, height: 812 },
  ] as const;

  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });

    await page.goto("/create");
    await expect(page.getByRole("heading", { name: "Create Ticket" })).toBeVisible();
    await assertNoHorizontalPageScroll(page);
    await page.screenshot({
      path: path.join("artifacts", "lab-02", "screenshots", "create-ticket", `${viewport.name}.png`),
      fullPage: true,
    });

    await page.goto("/my-tickets");
    await expectVisibleExactText(page, summary);
    await assertNoHorizontalPageScroll(page);
    if (viewport.width >= 768) {
      await assertNoHorizontalTableWrapperScroll(page);
    }
    await page.screenshot({
      path: path.join("artifacts", "lab-02", "screenshots", "my-tickets", `${viewport.name}.png`),
      fullPage: true,
    });

    await page.goto(`/tickets/${ticket.id}`);
    await expect(readOnlyField(page, "Summary")).toHaveValue(summary);
    await assertNoHorizontalPageScroll(page);
    await page.screenshot({
      path: path.join("artifacts", "lab-02", "screenshots", "ticket-detail", `${viewport.name}.png`),
      fullPage: true,
    });
  }
});
