import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";

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

async function createTicketViaApi(request: APIRequestContext, requester: Requester): Promise<Ticket> {
  const { categories, systems } = await getReferences(request, requester.id);
  const response = await request.post(`${API_URL}/api/tickets`, {
    data: {
      requesterId: requester.id,
      categoryId: categories[0].id,
      relatedSystemId: systems[0].id,
      summary: `A11Y ticket ${unique()}`,
      description: "Keyboard accessibility evidence ticket for Lab 2 Issue 12.",
      requestedPriority: "MEDIUM",
    },
  });
  expect(response.status()).toBe(201);
  return response.json();
}

async function uploadAttachment(request: APIRequestContext, requesterId: number, ticketId: number) {
  const filename = `a11y-${unique()}.pdf`;
  const response = await request.post(
    `${API_URL}/api/tickets/${ticketId}/attachments?requesterId=${requesterId}`,
    {
      multipart: {
        file: {
          name: filename,
          mimeType: "application/pdf",
          buffer: Buffer.from("%PDF-1.4\nIssue 12 accessibility fixture\n%%EOF"),
        },
      },
    },
  );
  expect(response.status()).toBe(201);
  return filename;
}

async function resetKeyboardFocus(page: Page) {
  await page.evaluate(() => {
    document.body.tabIndex = -1;
    document.body.focus();
  });
}

async function expectVisibleFocus(locator: Locator) {
  await expect(locator).toBeFocused();
  const focusStyle = await locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: Number.parseFloat(style.outlineWidth),
    };
  });
  expect(focusStyle.outlineStyle).not.toBe("none");
  expect(focusStyle.outlineWidth).toBeGreaterThanOrEqual(2);
}

async function tabTo(page: Page, target: Locator, maxTabs = 60) {
  for (let i = 0; i < maxTabs; i += 1) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((element) => element === document.activeElement)) {
      await expectVisibleFocus(target);
      return;
    }
  }
  throw new Error(`Keyboard focus did not reach target within ${maxTabs} Tab presses.`);
}

async function expectAllVisibleControlsTabReachable(page: Page) {
  const expectedIds = await page.locator("a[href], button, input, select, textarea").evaluateAll((elements) => {
    const ids: string[] = [];
    let index = 0;
    for (const element of elements) {
      const html = element as HTMLElement;
      const style = getComputedStyle(html);
      const rect = html.getBoundingClientRect();
      const disabled = "disabled" in element && Boolean((element as HTMLInputElement).disabled);
      const hiddenInput = element instanceof HTMLInputElement && element.type === "hidden";
      const visible =
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        rect.width > 0 &&
        rect.height > 0;
      if (!visible || disabled || hiddenInput || html.tabIndex < 0) continue;
      const id = `issue12-a11y-${index++}`;
      html.dataset.issue12A11y = id;
      ids.push(id);
    }
    return ids;
  });

  expect(expectedIds.length).toBeGreaterThan(0);
  await resetKeyboardFocus(page);
  const seen = new Set<string>();

  for (let i = 0; i < expectedIds.length + 5 && seen.size < expectedIds.length; i += 1) {
    await page.keyboard.press("Tab");
    const state = await page.evaluate(() => {
      const active = document.activeElement as HTMLElement | null;
      if (!active) return null;
      const style = getComputedStyle(active);
      return {
        id: active.dataset.issue12A11y ?? null,
        outlineStyle: style.outlineStyle,
        outlineWidth: Number.parseFloat(style.outlineWidth),
      };
    });
    if (!state?.id) continue;
    seen.add(state.id);
    expect(state.outlineStyle).not.toBe("none");
    expect(state.outlineWidth).toBeGreaterThanOrEqual(2);
  }

  expect([...seen].sort()).toEqual([...expectedIds].sort());
}

test("A11Y-01 keyboard-only controls are reachable, operable, labelled, and visibly focused", async ({
  page,
  request,
}) => {
  const requesters = await getRequesters(request);

  // Requester Selection: native select + Continue are labelled, keyboard reachable and operable.
  await page.goto("/");
  const requesterSelect = page.getByLabel("Development Requester");
  const continueButton = page.getByRole("button", { name: "Continue" });
  await expect(requesterSelect).toHaveAttribute("aria-required", "true");
  await resetKeyboardFocus(page);
  await tabTo(page, requesterSelect);
  await page.keyboard.press("ArrowDown");
  const selectedId = Number(await requesterSelect.inputValue());
  const requester = requesters.find((candidate) => candidate.id === selectedId);
  expect(requester).toBeTruthy();
  await page.keyboard.press("Tab");
  await expectVisibleFocus(continueButton);
  await expect(continueButton).toBeEnabled();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/my-tickets$/);

  const ticket = await createTicketViaApi(request, requester!);
  const filename = await uploadAttachment(request, requester!.id, ticket.id);

  // My Tickets: every visible enabled interactive control participates in the keyboard tab order.
  await page.goto("/my-tickets");
  await expect(page.getByLabel("Search", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Category")).toBeVisible();
  await expect(page.getByLabel("Requested Priority", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Current Status", { exact: true })).toBeVisible();
  const ticketNumberSort = page.getByRole("button", { name: /Sort by Ticket Number/ });
  await expect(ticketNumberSort).toBeVisible();
  await expect(page.getByRole("button", { name: /Sort by Created/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Sort by Requested Priority/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Sort by Last Updated/ })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: /Last Updated/ })).toHaveAttribute("aria-sort", "descending");
  await expect(page.getByLabel("Rows per page")).toBeVisible();
  await expectAllVisibleControlsTabReachable(page);

  await resetKeyboardFocus(page);
  await tabTo(page, ticketNumberSort);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("columnheader", { name: /Ticket Number/ })).toHaveAttribute("aria-sort", "descending");

  const search = page.getByLabel("Search", { exact: true });
  await resetKeyboardFocus(page);
  await tabTo(page, search);
  await page.keyboard.type("A11Y");
  await expect(search).toHaveValue("A11Y");
  await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await page.keyboard.press("Backspace");

  const createNav = page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Create Ticket" });
  await resetKeyboardFocus(page);
  await tabTo(page, createNav);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/create$/);

  // Create Ticket: required/editable/read-only controls are labelled and keyboard reachable.
  await expect(page.getByLabel("Category")).toBeEnabled();
  await expect(page.getByLabel("Ticket Number")).toHaveAttribute("readonly");
  await expect(page.getByLabel("Ticket Date")).toHaveAttribute("readonly");
  await expect(page.getByLabel("Requester")).toHaveAttribute("readonly");
  await expect(page.getByLabel("Related System")).toBeVisible();
  await expect(page.getByLabel("Requested Priority")).toBeVisible();
  await expect(page.getByLabel("Summary")).toHaveAttribute("aria-required", "true");
  await expect(page.getByLabel("Description")).toHaveAttribute("aria-required", "true");
  await expect(page.getByLabel("Choose files")).toBeVisible();
  await expectAllVisibleControlsTabReachable(page);

  const summary = page.getByLabel("Summary");
  await resetKeyboardFocus(page);
  await tabTo(page, summary);
  await page.keyboard.type("Keyboard entered summary");
  await expect(summary).toHaveValue("Keyboard entered summary");

  const createBack = page.getByRole("link", { name: "Back to My Tickets" });
  await resetKeyboardFocus(page);
  await tabTo(page, createBack);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/my-tickets$/);

  // Ticket Detail: read-only data and attachment controls expose accessible names and keyboard focus.
  await page.goto(`/tickets/${ticket.id}`);
  await expect(page.getByLabel("Ticket Number")).toHaveValue(ticket.ticketNumber);
  await expect(page.getByLabel("Ticket Date")).toBeVisible();
  await expect(page.getByLabel("Requester")).toHaveValue(requester!.name);
  await expect(page.getByLabel("Category")).toBeVisible();
  await expect(page.getByLabel("Related System")).toBeVisible();
  await expect(page.getByLabel("Summary")).toBeVisible();
  await expect(page.getByLabel("Description")).toBeVisible();
  await expect(page.getByLabel("Choose file")).toBeVisible();
  await expectAllVisibleControlsTabReachable(page);

  const attachmentRow = page.locator("li", { hasText: filename });
  const removeButton = attachmentRow.getByRole("button", { name: "Remove" });
  await resetKeyboardFocus(page);
  await tabTo(page, removeButton);
  await page.keyboard.press("Enter");

  // Removal modal: labelled dialog, required reason, real focus trap, Esc close, trigger focus return.
  const dialog = page.getByRole("dialog", { name: "Remove Attachment" });
  const reason = page.getByLabel("Reason");
  const cancel = page.getByRole("button", { name: "Cancel" });
  const confirm = page.getByRole("button", { name: "Confirm Removal" });
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await expect(reason).toHaveAttribute("aria-required", "true");
  await expectVisibleFocus(reason);
  await expect(confirm).toBeDisabled();
  await page.keyboard.press("Shift+Tab");
  await expectVisibleFocus(cancel);
  await page.keyboard.press("Tab");
  await expectVisibleFocus(reason);
  await page.keyboard.type("Keyboard accessibility check");
  await expect(confirm).toBeEnabled();
  await page.keyboard.press("Shift+Tab");
  await expectVisibleFocus(confirm);
  await page.keyboard.press("Tab");
  await expectVisibleFocus(reason);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expectVisibleFocus(removeButton);

  const detailBack = page.getByRole("link", { name: "Back to My Tickets" });
  await resetKeyboardFocus(page);
  await tabTo(page, detailBack);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/my-tickets$/);
});
