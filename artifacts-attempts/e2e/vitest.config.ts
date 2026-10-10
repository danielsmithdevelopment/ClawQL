import { defineConfig } from "vitest/config";

export default defineConfig({
  root: import.meta.dirname,
  test: {
    include: ["**/*.test.ts"],
    testTimeout: 180_000,
  },
});
