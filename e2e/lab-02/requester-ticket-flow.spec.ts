import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import path from "node:path";

const API_URL = "http://127.0.0.1:3100";

type Requester = { id: number; name: string; email: string };
type Reference = { id: number; name: string };
type Ticket = { id: number; ticketNumber: string };

const unique = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

async function getRequesters(request: APIRequestContext): Promise<Requester[]> {
  const response = await request.get(`${API_URL}/api/requesters`);
  expect(response.ok()).toBeTruthy();
  return response.json();
}

async function getReferences(request: APIRequestContext, requesterId: number) {
  const [categoriesResponse, systemsResponse] = await Promise.all([
    request.get(`${API_URL}/api/categories?requesterId=${requesterId}`),
    request.get(`${API_URL}/api/related-systems?requesterId=${requesterId}`),
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
  requester: Requester,
  summary: string,
): Promise<Ticket> {
  const { categories, systems } = await getReferences(request, requester.id);
  const response = await request.post(`${API_URL}/api/tickets`, {
    data: {
      requesterId: requester.id,
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

async function selectRequester(page: Page, requester: Requester) {
  await page.goto("/");
  await expect(page.getByLabel("Development Requester")).toBeVisible();
  await page.getByLabel("Development Requester").selectOption(String(requester.id));
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText(requester.name, { exact: true })).toBeVisible();
}

async function assertNoHorizontalPageScroll(page: Page) {
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
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
  const [requester] = await getRequesters(request);
  const { categories, systems } = await getReferences(request, requester.id);
  const marker = `E2E01-${unique()}`;
  const summary = `Printer issue ${marker}`;

  await selectRequester(page, requester);
  await page.getByRole("navigation").getByRole("link", { name: "Create Ticket" }).click();
  await page.getByLabel("Category").selectOption(String(categories[0].id));
  await page.getByLabel("Related System").selectOption(String(systems[0].id));
  await page.getByLabel("Requested Priority").selectOption("HIGH");
  await page.getByLabel("Summary").fill(summary);
  await page.getByLabel("Description").fill(`The printer cannot complete a job for marker ${marker}.`);
  const [createResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/tickets" &&
        response.request().method() === "POST",
    ),
    page.getByRole("button", { name: "Submit Ticket" }).click(),
  ]);
  expect(createResponse.status()).toBe(201);

  const ticketNumberText = page.getByText(/Official Ticket Number:/);
  await expect(ticketNumberText).toBeVisible({ timeout: 10_000 });
  const ticketNumber = (await ticketNumberText.locator("strong").textContent())?.trim();
  expect(ticketNumber).toMatch(/^\d{4}-\d{4}$/);

  await page.getByRole("link", { name: "View My Tickets" }).click();
  await page.getByLabel("Search tickets").fill(marker.toLowerCase());
  const ticketRow = page.locator("tr", { hasText: summary });
  await expect(ticketRow).toContainText(ticketNumber!);
  await ticketRow.getByRole("link", { name: "Open" }).click();

  await expect(readOnlyField(page, "Ticket Number")).toHaveValue(ticketNumber!);
  await expect(readOnlyField(page, "Summary")).toHaveValue(summary);
  await expect(readOnlyField(page, "Requester")).toHaveValue(requester.name);
});

test("E2E-02 requester B cannot open requester A ticket by direct URL", async ({ page, request }) => {
  const [requesterA, requesterB] = await getRequesters(request);
  const ticketA = await createTicketViaApi(request, requesterA, `A-owned-${unique()}`);

  await selectRequester(page, requesterB);
  await page.goto(`/tickets/${ticketA.id}`);
  await expect(page.getByText("Ticket not found", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to My Tickets" })).toBeVisible();
});

test("E2E-03 removal blocks blank reason then preserves removed metadata", async ({ page, request }) => {
  const [requester] = await getRequesters(request);
  const ticket = await createTicketViaApi(request, requester, `Attachment-${unique()}`);
  const filename = `issue11-${unique()}.pdf`;
  const upload = await request.post(
    `${API_URL}/api/tickets/${ticket.id}/attachments?requesterId=${requester.id}`,
    {
      multipart: {
        file: {
          name: filename,
          mimeType: "application/pdf",
          buffer: Buffer.from("%PDF-1.4\nIssue 11 E2E fixture\n%%EOF"),
        },
      },
    },
  );
  expect(upload.status()).toBe(201);

  await selectRequester(page, requester);
  await page.goto(`/tickets/${ticket.id}`);
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

test("E2E-04 switching requester reloads owned tickets without cross-requester leakage", async ({ page, request }) => {
  const [requesterA, requesterB] = await getRequesters(request);
  const summaryA = `Requester-A-${unique()}`;
  const summaryB = `Requester-B-${unique()}`;
  await createTicketViaApi(request, requesterA, summaryA);
  await createTicketViaApi(request, requesterB, summaryB);

  await selectRequester(page, requesterA);
  await page.getByRole("link", { name: "My Tickets" }).click();
  await expectVisibleExactText(page, summaryA);
  await expect(page.getByText(summaryB, { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Change Requester" }).click();
  await page.getByLabel("Development Requester").selectOption(String(requesterB.id));
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText(requesterB.name, { exact: true })).toBeVisible();
  await expectVisibleExactText(page, summaryB);
  await expect(page.getByText(summaryA, { exact: true })).toHaveCount(0);
});

test("E2E-05 captures responsive evidence at 1440 / 900 / 375 widths", async ({ page, request }) => {
  const [requester] = await getRequesters(request);
  const summary = `Responsive-${unique()}`;
  const ticket = await createTicketViaApi(request, requester, summary);

  await page.goto("/");
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByLabel("Development Requester")).toBeVisible();
  await assertNoHorizontalPageScroll(page);
  await page.screenshot({
    path: path.join("artifacts", "lab-02", "screenshots", "requester-selection", "desktop.png"),
    fullPage: true,
  });

  await page.getByLabel("Development Requester").selectOption(String(requester.id));
  await page.getByRole("button", { name: "Continue" }).click();

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
