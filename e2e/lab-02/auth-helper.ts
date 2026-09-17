// Lab-2 authenticate-first helper (Issue #45, Task 8, test-only).
//
// The Task 6 auth gate fronts the whole app with Login, so Lab-2 specs
// (written for the pre-auth requester-selector flow) must sign in before
// their original selector steps. Call loginAs(page, email, password) FIRST
// in each spec; all original steps/assertions stay untouched.
//
// Seeded users start with mustChangePassword=true, so the first login lands
// on the mandatory change-password gate, which this helper completes. The
// seed is create-missing-only (never resets passwords), so later tests/runs
// find the credential already changed: on "Invalid email or password" the
// helper retries with the changed password below. The changed password is a
// deterministic constant (NOT unique per run) for exactly this reason —
// anything timestamp-unique would be unrecoverable after the first test.
import { expect, type Page } from "@playwright/test";

// Test-only mirror of LOCAL_INITIAL_PASSWORD, whose single source of truth
// is server/src/lib/migrated-credentials.ts (duplicated here because
// Playwright cannot resolve the server TS `.js` path aliases).
export const LAB02_INITIAL_PASSWORD = "Requester#2026-local";

// Policy-shaped (8-64 chars, upper + lower + special) and differs from the
// initial password above, per the server policy (password-policy.ts).
const LAB02_CHANGED_PASSWORD = "Lab02#E2E-changed-Aa1!";

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
