import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    // Shared toktickit_test DB: parallel workers race on fixed ids/counts
    // (CI P2002 + count flakes on #44). Keep serial until tests are fully
    // namespace-isolated. Vitest 2 runs the forks pool by default, so pin
    // pool 'forks' with singleFork (threads.singleThread kept as backstop).
    pool: "forks",
    poolOptions: {
      forks: { singleFork: true },
      threads: { singleThread: true },
    },
  },
});
