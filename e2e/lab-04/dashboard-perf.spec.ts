// Lab 4 PERF-01: dashboard perf-smoke (Issue #81, tests.md:22).
//
// Measures dashboard API + UI response on the seeded baseline and COMMITS
// the numbers (artifacts/lab-04/perf/dashboard-smoke.json). Measure-only:
// no thresholds asserted, no tuning claims. The run fails only on request
// errors, timeouts, or missing measurements (D-81-03).
//
// Fixtures are DEDICATED fixed e2e-owned users (never seeded ones); the
// measured dataset is the shared seeded baseline plus these users.
import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { cleanupUser, login, setupUser, trackPageFaults } from "./helpers";

const PERF_DIR = path.resolve("artifacts", "lab-04", "perf");

const REQ_EMAIL = "e2e-lab04-perf-req@example.com";
const STAFF_EMAIL = "e2e-lab04-perf-staff@example.com";

test.beforeAll(() => {
  setupUser(REQ_EMAIL, "E2E Lab04 Perf Req", "REQUESTER");
  setupUser(STAFF_EMAIL, "E2E Lab04 Perf Staff", "IT_STAFF");
});

test.afterAll(() => {
  cleanupUser(REQ_EMAIL);
  cleanupUser(STAFF_EMAIL);
});

test("PERF-01 dashboard API and UI response measured on seeded data", async ({ page }) => {
  const pageFaults = trackPageFaults(page);
  const numbers: Record<string, number> = {};

  async function timeApi(label: string, url: string): Promise<void> {
    // In-page fetch: the API origin (:3100) differs from the page origin
    // (:5174), so context-level page.request would not carry the session
    // cookie. credentials:include + the E2E APP_ORIGINS allowlist applies.
    const { ok, ms } = (await page.evaluate(async (target) => {
      const started = Date.now();
      const res = await fetch(target, { credentials: "include" });
      return { ok: res.ok, ms: Date.now() - started };
    }, url)) as { ok: boolean; ms: number };
    expect(ok, `${label} responds 200`).toBe(true);
    expect(Number.isFinite(ms) && ms >= 0).toBe(true);
    numbers[label] = ms;
  }

  async function timePage(label: string, url: string, readyText: string): Promise<void> {
    const started = Date.now();
    await page.goto(url);
    await expect(page.getByText(readyText, { exact: true }).first()).toBeVisible();
    const ms = Date.now() - started;
    expect(Number.isFinite(ms) && ms >= 0).toBe(true);
    numbers[label] = ms;
  }

  await login(page, REQ_EMAIL);
  await timeApi("api_requester_dashboard_ms", "http://127.0.0.1:3100/api/dashboard/requester");
  await timePage("ui_requester_dashboard_ms", "/dashboard", "Open Tickets");

  await login(page, STAFF_EMAIL);
  await timeApi("api_staff_dashboard_ms", "http://127.0.0.1:3100/api/dashboard/staff");
  await timePage("ui_staff_dashboard_ms", "/staff-dashboard", "Owned by me");

  fs.mkdirSync(PERF_DIR, { recursive: true });
  const record = {
    measuredAt: new Date().toISOString(),
    dataset: "shared toktickit_test seeded baseline plus dedicated e2e-lab04-perf users",
    notes: "measure-only smoke; no thresholds asserted, no tuning claims",
    ...numbers,
  };
  fs.writeFileSync(path.join(PERF_DIR, "dashboard-smoke.json"), `${JSON.stringify(record, null, 2)}\n`);
  // eslint-disable-next-line no-console
  console.table(numbers);

  expect(Object.keys(numbers)).toHaveLength(4);
  expect(pageFaults).toEqual([]);
});
