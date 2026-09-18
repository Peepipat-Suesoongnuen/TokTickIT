import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import path from "node:path";
import { E2E_REQUESTER_EMAIL, LAB02_INITIAL_PASSWORD, ensureApiAuth, loginAs } from "./auth-helper";

const API_URL = "http://127.0.0.1:3100";
const STATE_DIR = path.join("artifacts", "lab-02", "screenshots", "states");

type Reference = { id: number; name: string };

async function getReferences(request: APIRequestContext) {
  // Issue #45 (PR #58 review): reference-data routes are session-only —
  // `requesterId` is not accepted (unknown query parameter → 400).
  await ensureApiAuth(request, E2E_REQUESTER_EMAIL, LAB02_INITIAL_PASSWORD);
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

async function assertNoHorizontalPageScroll(page: Page) {
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
}

async function captureState(page: Page, name: string) {
  await assertNoHorizontalPageScroll(page);
  await page.screenshot({ path: path.join(STATE_DIR, `${name}.png`), fullPage: true });
}

async function fillValidCreateForm(
  page: Page,
  categoryId: number,
  relatedSystemId: number,
  marker: string,
) {
  await page.getByLabel("Category").selectOption(String(categoryId));
  await page.getByLabel("Related System").selectOption(String(relatedSystemId));
  await page.getByLabel("Requested Priority").selectOption("HIGH");
  await page.getByLabel("Summary").fill(`Visual state ${marker}`);
  await page.getByLabel("Description").fill(`Visual state evidence description for ${marker}.`);
}

test("VISUAL-01 captures required requester/create/list/attachment visual states", async ({
  page,
  request,
}) => {
  const { categories, systems } = await getReferences(request);

  // Authenticate-first (Issue #45): the login gate fronts the whole app.
  // Issue #46: the requester selector is deleted — the requester-loading and
  // requester-failure states no longer exist (the app shell renders My Tickets
  // directly after login). Submission evidence below covers the retained
  // loading + safe API-failure states.
  await loginAs(page, E2E_REQUESTER_EMAIL, LAB02_INITIAL_PASSWORD);

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "My Tickets" })).toBeVisible();

  const navToggle = page.getByRole("button", { name: "Toggle navigation" });
  const toggleBox = await navToggle.boundingBox();
  expect(toggleBox).not.toBeNull();
  expect(toggleBox!.width).toBeGreaterThanOrEqual(44);
  expect(toggleBox!.height).toBeGreaterThanOrEqual(44);
  await page.keyboard.press("Tab");
  await navToggle.focus();
  const focusStyle = await navToggle.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      outlineColor: style.outlineColor,
    };
  });
  expect(focusStyle).toEqual({
    outlineStyle: "solid",
    outlineWidth: "2px",
    outlineColor: "rgb(11, 122, 70)",
  });

  let releaseCategories!: () => void;
  const categoryGate = new Promise<void>((resolve) => {
    releaseCategories = resolve;
  });
  // Issue #46: reference-data requests are session-only (no requesterId
  // query parameter), so the gate matches the bare categories path.
  const categoryPredicate = (url: URL) => url.pathname === "/api/categories";
  await page.route(categoryPredicate, async (route) => {
    await categoryGate;
    await route.continue();
  });

  await page.goto("/create");
  await expect(page.getByText(/Loading reference data/)).toBeVisible();
  await captureState(page, "loading");
  releaseCategories();
  await expect(page.getByLabel("Category")).toBeEnabled();
  await page.unroute(categoryPredicate);

  await page.getByRole("button", { name: "Submit Ticket" }).click();
  await expect(page.getByText("Please select a category.")).toBeVisible();
  await expect(page.getByLabel("Category")).toBeFocused();
  await captureState(page, "validation");

  // Submission evidence: one permitted + one rejected attachment selected together.
  await page.goto("/create");
  await expect(page.getByLabel("Category")).toBeEnabled();
  await page.getByLabel("Choose files").setInputFiles([
    {
      name: "valid-evidence.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4\nLab 2 valid attachment evidence\n%%EOF"),
    },
    {
      name: "invalid-evidence.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("invalid attachment evidence"),
    },
  ]);
  await expect(page.getByText(/valid-evidence\.pdf/)).toBeVisible();
  await expect(page.getByText(/invalid-evidence\.txt.*File type not allowed/)).toBeVisible();
  await captureState(page, "invalid-attachment");
  await page.goto("/create");
  await expect(page.getByLabel("Category")).toBeEnabled();

  await fillValidCreateForm(page, categories[0].id, systems[0].id, "submitting");

  let releaseCreate!: () => void;
  const createGate = new Promise<void>((resolve) => {
    releaseCreate = resolve;
  });
  await page.route("**/api/tickets", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await createGate;
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ id: 9001, ticketNumber: "2609-9001" }),
    });
  });

  await page.getByRole("button", { name: "Submit Ticket" }).click();
  const submitting = page.getByRole("button", { name: /Submitting/ });
  await expect(submitting).toBeDisabled();
  await captureState(page, "submitting");
  releaseCreate();
  await expect(page.getByText(/Official Ticket Number:/)).toContainText("2609-9001");
  await captureState(page, "success");
  await page.unroute("**/api/tickets");

  await page.getByRole("button", { name: "Create Another" }).click();
  await fillValidCreateForm(page, categories[0].id, systems[0].id, "failure");
  await page.route("**/api/tickets", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          code: "INTERNAL_ERROR",
          message: "An unexpected error occurred. Please try again.",
        },
      }),
    });
  });
  await page.getByRole("button", { name: "Submit Ticket" }).click();
  await expect(page.getByRole("alert")).toContainText("An unexpected error occurred. Please try again.");
  await captureState(page, "failure");
  await page.unroute("**/api/tickets");

  // Issue #46: ticket list requests are session-only (no requesterId query
  // parameter), so the empty/no-results mocks match the bare tickets path.
  const listPredicate = (url: URL) => url.pathname === "/api/tickets" && !url.searchParams.has("search");
  const searchPredicate = (url: URL) => url.pathname === "/api/tickets" && url.searchParams.has("search");
  await page.route(listPredicate, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: [],
        meta: {
          page: 1,
          pageSize: 10,
          totalCount: 0,
          totalPages: 0,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      }),
    });
  });
  await page.route(searchPredicate, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: [],
        meta: {
          page: 1,
          pageSize: 10,
          totalCount: 1,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      }),
    });
  });

  await page.goto("/my-tickets");
  await expect(page.getByText("You have not created any tickets yet")).toBeVisible();
  await captureState(page, "empty");

  await page.getByLabel("Search", { exact: true }).fill("no visual match");
  await expect(page.getByText("No tickets match your search or filters")).toBeVisible();
  await captureState(page, "no-results");
  await page.unroute(listPredicate);
  await page.unroute(searchPredicate);

  // Issue #46: ticket + upload are owned by the dedicated e2e session
  // (no requesterId in body or query).
  const createResponse = await request.post(`${API_URL}/api/tickets`, {
    data: {
      categoryId: categories[0].id,
      relatedSystemId: systems[0].id,
      summary: `Removed visual ${Date.now()}`,
      description: "Visual evidence ticket for the removed attachment state.",
      requestedPriority: "MEDIUM",
    },
  });
  expect(createResponse.status()).toBe(201);
  const ticket = (await createResponse.json()) as { id: number };
  const filename = `visual-removed-${Date.now()}.pdf`;
  const uploadResponse = await request.post(`${API_URL}/api/tickets/${ticket.id}/attachments`, {
    multipart: {
      file: {
        name: filename,
        mimeType: "application/pdf",
        buffer: Buffer.from("%PDF-1.4\nIssue 12 visual fixture\n%%EOF"),
      },
    },
  });
  expect(uploadResponse.status()).toBe(201);

  await page.goto(`/tickets/${ticket.id}`);
  const row = page.locator("li", { hasText: filename });
  await row.getByRole("button", { name: "Remove" }).click();
  await page.getByLabel("Reason").fill("Issue 12 visual evidence");
  await page.getByRole("button", { name: "Confirm Removal" }).click();
  await expect(row).toContainText("Reason: Issue 12 visual evidence");
  await captureState(page, "removed-attachment");
});
