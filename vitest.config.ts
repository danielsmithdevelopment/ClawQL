import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const repoRoot = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    dedupe: ["graphql"],
    alias: {
      /** Force one `graphql` instance: CJS `graphql-compose` uses `index.js`; ESM Omnigraph must match (#138). */
      graphql: resolve(repoRoot, "node_modules/graphql/index.js"),
    },
  },
  test: {
    environment: "node",
    include: [
      "src/**/*.test.ts",
      "packages/mcp-grpc-transport/src/**/*.test.ts",
      "packages/clawql-ouroboros/src/**/*.test.ts",
    ],
    /** Avoid worker RPC teardown races when HTTP servers + fetch leave sockets pending. */
    teardownTimeout: 20_000,
    pool: "forks",
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "html"],
      include: [
        "src/**/*.ts",
        "packages/mcp-grpc-transport/src/**/*.ts",
        "packages/clawql-ouroboros/src/**/*.ts",
      ],
      exclude: [
        "src/**/*.test.ts",
        "packages/mcp-grpc-transport/src/**/*.test.ts",
        "packages/clawql-ouroboros/src/**/*.test.ts",
        "src/test-utils/**",
        "src/swagger2openapi.d.ts",
      ],
    },
  },
});
