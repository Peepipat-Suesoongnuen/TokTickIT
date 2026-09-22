// Lab 3 security regression E2E (Issue #51, E2E-06, AC-03/04/07/18).
//
// Hosted proof that protection lives in the backend: stale sessions die,
// unauthenticated/cross-role/cross-owner direct API attempts fail safely,
// staff-only and admin-only surfaces reject the wrong roles, and the
// exact-Origin boundary holds on state-changing routes.
//
// Fixtures are dedicated fixed e2e-owned users with seeded reference data;
// tickets are created through the API under the owners' sessions.
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { getTestDatabaseUrl } from "../lab-02/test-env";

const API_URL = "http://127.0.0.1:3100";
const ORIGIN = "http://127.0.0.1:5174";

const REQ_A = "e2e-sec-a@example.com";
const REQ_B = "e2e-sec-b@example.com";
const STAFF = "e2e-sec-staff@example.com";
const PASSWORD = "E2E-Sec#Reg-Cc7!";

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

async function apiCreateTicket(ctx: APIRequestContext): Promise<number> {
  const ref = await ctx.get(`${API_URL}/api/categories`);
  expect(ref.status()).toBe(200);
  const categories = (await ref.json()) as Array<{ id: number }>;
  const systemsRes = await ctx.get(`${API_URL}/api/related-systems`);
  const systems = (await systemsRes.json()) as Array<{ id: number }>;
  const create = await ctx.post(`${API_URL}/api/tickets`, {
    headers: { Origin: ORIGIN },
    data: {
      categoryId: categories[0].id,
      relatedSystemId: systems[0].id,
      summary: "E2E security probe ticket",
      description: "Security regression fixture ticket body.",
      requestedPriority: "MEDIUM",
    },
  });
  expect(create.status()).toBe(201);
  return ((await create.json()) as { id: number }).id;
}

async function uiLogin(page: Page, email: string): Promise<void> {
  await page.goto("/");
  await page.locator("#login-email").fill(email);
  await page.locator("#login-password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page.locator(".lab3-user-menu")).toBeVisible();
}

test.beforeAll(() => {
  runUserHelper(["setup", REQ_A, PASSWORD, "E2E Sec A", "REQUESTER", "false"]);
  runUserHelper(["setup", REQ_B, PASSWORD, "E2E Sec B", "REQUESTER", "false"]);
  runUserHelper(["setup", STAFF, PASSWORD, "E2E Sec Staff", "IT_STAFF", "false"]);
});

test.afterAll(() => {
  runUserHelper(["cleanup", REQ_A]);
  runUserHelper(["cleanup", REQ_B]);
  runUserHelper(["cleanup", STAFF]);
});

test("E2E-06 logout invalidation, direct API/URL denial, origin boundary", async ({
  page,
  playwright,
}) => {
  // One isolated API context per actor: cookie jars must never mix
  // sessions across the negative assertions below.
  const ctxA = await playwright.request.newContext();
  const ctxB = await playwright.request.newContext();
  const ctxStaff = await playwright.request.newContext();
  const ctxAnon = await playwright.request.newContext();
  try {
    await runE2E06(page, ctxA, ctxB, ctxStaff, ctxAnon);
  } finally {
    await ctxA.dispose();
    await ctxB.dispose();
    await ctxStaff.dispose();
    await ctxAnon.dispose();
  }
});

async function apiLoginIn(ctx: APIRequestContext, email: string): Promise<void> {
  const res = await ctx.post(`${API_URL}/api/auth/login`, {
    headers: { Origin: ORIGIN },
    data: { email, password: PASSWORD },
  });
  expect(res.status()).toBe(200);
}

async function runE2E06(
  page: Page,
  ctxA: APIRequestContext,
  ctxB: APIRequestContext,
  ctxStaff: APIRequestContext,
  ctxAnon: APIRequestContext,
): Promise<void> {
  await apiLoginIn(ctxA, REQ_A);
  await apiLoginIn(ctxB, REQ_B);
  await apiLoginIn(ctxStaff, STAFF);
  const ticketA = await apiCreateTicket(ctxA);

  // Logged-out session is dead for protected APIs.
  await ctxB.post(`${API_URL}/api/auth/logout`, { headers: { Origin: ORIGIN } });
  const stale = await ctxB.get(`${API_URL}/api/tickets/${ticketA}`);
  expect(stale.status()).toBe(401);

  // Fresh session for B: cross-owner probes below need authentication.
  await apiLoginIn(ctxB, REQ_B);

  // Unauthenticated direct access to another Requester's ticket.
  const anon = await ctxAnon.get(`${API_URL}/api/tickets/${ticketA}`);
  expect(anon.status()).toBe(401);

  // Cross-owner direct API attempts hide safely.
  for (const [method, url, data] of [
    ["get", `/api/tickets/${ticketA}`, undefined],
    ["get", `/api/tickets/${ticketA}/comments`, undefined],
    ["post", `/api/tickets/${ticketA}/comments`, { content: "Intrusion probe." }],
    ["post", `/api/tickets/${ticketA}/problem-appears-resolved`, {}],
  ] as const) {
    const res =
      method === "get"
        ? await ctxB.get(`${API_URL}${url}`)
        : await ctxB.post(`${API_URL}${url}`, { headers: { Origin: ORIGIN }, data });
    expect(res.status()).toBe(404);
  }

  // Requester direct calls on staff routes are forbidden, never data.
  for (const [method, url, data] of [
    ["get", "/api/staff/tickets", undefined],
    ["get", `/api/staff/tickets/${ticketA}`, undefined],
    ["get", "/api/staff/ticket-owners", undefined],
    ["post", `/api/staff/tickets/${ticketA}/claim`, {}],
    ["get", `/api/staff/tickets/${ticketA}/internal-notes`, undefined],
  ] as const) {
    const res =
      method === "get"
        ? await ctxA.get(`${API_URL}${url}`)
        : await ctxA.post(`${API_URL}${url}`, { headers: { Origin: ORIGIN }, data });
    expect(res.status()).toBe(403);
    expect(await res.text()).not.toContain("InternalNote");
  }

  // Staff direct calls on admin routes are forbidden.
  const adminProbe = await ctxStaff.get(`${API_URL}/api/admin/users`);
  expect(adminProbe.status()).toBe(403);

  // Missing Origin on a state-changing route fails closed first.
  const noOrigin = await ctxA.post(`${API_URL}/api/tickets/${ticketA}/comments`, {
    data: { content: "No-origin probe." },
  });
  expect(noOrigin.status()).toBe(403);
  expect((await noOrigin.json()).error.code).toBe("ORIGIN_NOT_ALLOWED");

  // Direct URL access to staff/admin screens renders no privileged content.
  await uiLogin(page, REQ_A);
  await page.goto("/staff/queue");
  await expect(page.getByRole("heading", { name: "My Tickets" })).toBeVisible();
  await expect(page.getByText("Ticket Queue")).toHaveCount(0);
  await page.goto("/admin/users");
  await expect(page.getByRole("heading", { name: "My Tickets" })).toBeVisible();
}
