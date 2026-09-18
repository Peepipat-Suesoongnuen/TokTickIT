// Lab-2 authenticate-first helper (Issue #45, Task 8, test-only).
//
// The Task 6 auth gate fronts the whole app with Login, so Lab-2 specs
// (written for the pre-auth requester-selector flow) must sign in before
// their original selector steps. Call loginAs(page, email, password) FIRST
// in each spec; all original steps/assertions stay untouched.
//
// Seeded users are NEVER used here: loginAs signs in ONLY as the dedicated
// e2e-owned user below (upserted with a fresh initial hash by global-setup on
// every run, so prior runs' password changes never leak). The first login of
// a run lands on the mandatory change-password gate, which this helper
// completes; later tests in the same run find the credential already changed,
// so on "Invalid email or password" the helper retries with the changed
// password below. The changed password is a deterministic constant (NOT
// unique per run) for exactly this reason — anything timestamp-unique would
// be unrecoverable after the first test.
import { expect, type APIRequestContext, type Page } from "@playwright/test";

// Dedicated e2e-owned login identity (Issue #45 isolation fix). NEVER pass a
// seeded email to loginAs — seeded rows must stay pristine for seed.test.ts.
export const E2E_REQUESTER_EMAIL = "e2e-requester@example.com";

// Test-only mirror of LOCAL_INITIAL_PASSWORD, whose single source of truth
// is server/src/lib/migrated-credentials.ts (duplicated here because
// Playwright cannot resolve the server TS `.js` path aliases).
export const LAB02_INITIAL_PASSWORD = "Requester#2026-local";

// Policy-shaped (8-64 chars, upper + lower + special) and differs from the
// initial password above, per the server policy (password-policy.ts).
export const LAB02_CHANGED_PASSWORD = "Lab02#E2E-changed-Aa1!";

const E2E_API_URL = "http://127.0.0.1:3100";
// Must stay inside the e2e server's APP_ORIGINS allowlist
// (playwright.config.ts); the API request context is not a browser, so the
// Origin header is set explicitly.
const E2E_API_ORIGIN = "http://localhost:5174";

// Reviewer fix 2 (Issue #45, test-only): the reference-data routes are
// session-gated, so specs that fetch them via Playwright's `request` context
// (a separate cookie jar per test) must sign that context in first. Mirrors
// loginAs: initial password first, changed-password fallback, then complete
// the mandatory change gate via API when present so later GETs are not 403.
// Safe to call repeatedly (later calls are plain logins).
export async function ensureApiAuth(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<void> {
  let currentPassword = password;
  let login = await request.post(`${E2E_API_URL}/api/auth/login`, {
    headers: { Origin: E2E_API_ORIGIN },
    data: { email, password: currentPassword },
  });
  if (login.status() === 401) {
    currentPassword = LAB02_CHANGED_PASSWORD;
    login = await request.post(`${E2E_API_URL}/api/auth/login`, {
      headers: { Origin: E2E_API_ORIGIN },
      data: { email, password: currentPassword },
    });
  }
  expect(login.ok()).toBeTruthy();
  const body = (await login.json()) as { user?: { mustChangePassword?: boolean } };
  if (body?.user?.mustChangePassword === true) {
    const change = await request.post(`${E2E_API_URL}/api/auth/change-password`, {
      headers: { Origin: E2E_API_ORIGIN },
      data: { currentPassword, newPassword: LAB02_CHANGED_PASSWORD },
    });
    expect(change.ok()).toBeTruthy();
  }
}

async function submitLogin(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/");
  await page.locator("#login-email").fill(email);
  await page.locator("#login-password").fill(password);
  await page.getByRole("button", { name: "Sign In" }).click();
}

export async function loginAs(page: Page, email: string, password: string): Promise<void> {
  let currentPassword = password;
  await submitLogin(page, email, currentPassword);

  const changeHeading = page.getByRole("heading", { name: "Change Password" });
  const requesterSelect = page.getByLabel("Development Requester");
  const loginAlert = page.getByRole("alert");

  // Exactly one of: change gate, requester selector, or login error.
  await expect(changeHeading.or(requesterSelect).or(loginAlert)).toBeVisible({ timeout: 10_000 });

  if (await loginAlert.isVisible()) {
    const text = (await loginAlert.textContent()) ?? "";
    if (text.includes("Invalid email or password") && currentPassword !== LAB02_CHANGED_PASSWORD) {
      // Credential was already changed by an earlier test/run (seed never
      // resets passwords): retry once with the changed password.
      currentPassword = LAB02_CHANGED_PASSWORD;
      await submitLogin(page, email, currentPassword);
      await expect(changeHeading.or(requesterSelect)).toBeVisible({ timeout: 10_000 });
    } else {
      throw new Error(`loginAs failed for ${email}: ${text.trim() || "unknown login error"}`);
    }
  }

  if (await changeHeading.isVisible()) {
    await page.locator("#cp-current").fill(currentPassword);
    await page.locator("#cp-new").fill(LAB02_CHANGED_PASSWORD);
    await page.locator("#cp-confirm").fill(LAB02_CHANGED_PASSWORD);
    await page.getByRole("button", { name: "Change Password" }).click();
  }

  // Landed in the app: requester selection is the post-auth entry point.
  await expect(requesterSelect).toBeVisible({ timeout: 10_000 });
}
