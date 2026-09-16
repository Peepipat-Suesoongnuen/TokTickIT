import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    // Shared toktickit_test DB: parallel workers race on fixed ids/counts
    // (CI P2002 + count flakes on #44). Keep serial until tests are fully
    // namespace-isolated.
    poolOptions: {
      threads: { singleThread: true },
    },
  },
});
