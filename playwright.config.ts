import { defineConfig } from "@playwright/test";
import { getTestDatabaseUrl } from "./e2e/lab-02/test-env";

const testDatabaseUrl = getTestDatabaseUrl();

export default defineConfig({
  testDir: "./e2e/lab-02",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["line"], ["html", { open: "never" }]] : "list",
  globalSetup: "./e2e/lab-02/global-setup.ts",
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
