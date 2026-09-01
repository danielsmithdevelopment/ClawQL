import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "plugins/**/*.test.ts", "bench/**/*.test.ts"],
  },
});
