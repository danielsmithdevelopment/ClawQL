import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "src/**/*.integration.test.ts"],
    environment: "node",
    testTimeout: 120_000,
  },
});
