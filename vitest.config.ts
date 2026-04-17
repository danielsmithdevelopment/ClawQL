import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "packages/mcp-grpc-transport/src/**/*.test.ts"],
    pool: "forks",
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "html"],
      include: ["src/**/*.ts", "packages/mcp-grpc-transport/src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "packages/mcp-grpc-transport/src/**/*.test.ts",
        "src/test-utils/**",
        "src/swagger2openapi.d.ts",
      ],
    },
  },
});
