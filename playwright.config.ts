import { defineConfig } from "@playwright/test";
import { getTestDatabaseUrl } from "./e2e/lab-02/test-env";

const testDatabaseUrl = getTestDatabaseUrl();

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["line"], ["html", { open: "never" }]] : "list",
  globalSetup: "./e2e/lab-02/global-setup.ts",
  // Issue #81 (D-81-04, AC-020 determinism): lab-04 specs never retry —
  // a pass-on-retry would hide a flake. Lab-02/03 keep the existing
  // CI-only single retry untouched.
  projects: [
    {
      name: "lab-04",
      testDir: "./e2e/lab-04",
      retries: 0,
    },
    {
      name: "lab-02-03",
      testDir: "./e2e",
      testIgnore: ["**/lab-04/**"],
    },
  ],
  use: {
    baseURL: "http://127.0.0.1:5174",
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "npm run dev",
      cwd: "./server",
      url: "http://127.0.0.1:3100/api/health",
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...process.env,
        NODE_ENV: "test",
        PORT: "3100",
        DATABASE_URL: testDatabaseUrl,
        TEST_DATABASE_URL: testDatabaseUrl,
        // Lab 3 (Issue #45, Task 7): the E2E browser origin is
        // http://127.0.0.1:5174, which is NOT in the product local-dev defaults
        // (http://localhost:5173, http://localhost:5174). Without this, the server Origin gate (403
        // ORIGIN_NOT_ALLOWED) + CORS reject every E2E login/change-password
        // call. Test-infra only — product default is untouched.
        APP_ORIGINS: "http://127.0.0.1:5174,http://localhost:5174",
      },
    },
    {
      command: "npm run dev -- --host 127.0.0.1 --port 5174",
      cwd: "./client",
      url: "http://127.0.0.1:5174",
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...process.env,
        VITE_API_URL: "http://127.0.0.1:3100",
      },
    },
  ],
});
