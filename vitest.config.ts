import { createRequire } from "node:module";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const configDir = dirname(fileURLToPath(import.meta.url));
/** CJS `main` — same file `graphql-compose` resolves; avoids Vitest loading `index.mjs` alongside it (#138, #149). */
const graphqlMain = createRequire(import.meta.url).resolve("graphql");

export default defineConfig({
  /** Keep globs and `node_modules` resolution anchored to the repo even if `cwd` differs (CI, tooling). */
  root: configDir,
  resolve: {
    dedupe: ["graphql"],
    alias: {
      graphql: graphqlMain,
    },
  },
  test: {
    environment: "node",
    include: [
      "src/**/*.test.ts",
      "packages/mcp-grpc-transport/src/**/*.test.ts",
      "packages/clawql-core/src/**/*.test.ts",
      "packages/clawql-api/src/**/*.test.ts",
      "packages/clawql-documents/src/**/*.test.ts",
      "packages/clawql-automation/src/**/*.test.ts",
      "packages/clawql-sandbox/src/**/*.test.ts",
      "packages/clawql-ouroboros/src/**/*.test.ts",
      "packages/panguard-mcp-bridge/src/**/*.test.ts",
      "scripts/kubernetes/**/*.test.ts",
    ],
    /** Avoid worker RPC teardown races when HTTP servers + fetch leave sockets pending. */
    teardownTimeout: 30_000,
    /** HTTP/MCP tests log to stderr; intercepting console queues onUserConsoleLog RPC that can race worker exit. */
    disableConsoleIntercept: true,
    pool: "forks",
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "html"],
      include: [
        "src/**/*.ts",
        "packages/mcp-grpc-transport/src/**/*.ts",
        "packages/clawql-core/src/**/*.ts",
        "packages/clawql-api/src/**/*.ts",
        "packages/clawql-memory/src/**/*.ts",
        "packages/clawql-automation/src/**/*.ts",
        "packages/clawql-ouroboros/src/**/*.ts",
        "packages/panguard-mcp-bridge/src/**/*.ts",
      ],
      exclude: [
        "src/**/*.test.ts",
        "packages/mcp-grpc-transport/src/**/*.test.ts",
        "packages/clawql-core/src/**/*.test.ts",
        "packages/clawql-api/src/**/*.test.ts",
        "packages/clawql-automation/src/**/*.test.ts",
        "packages/clawql-ouroboros/src/**/*.test.ts",
        "packages/panguard-mcp-bridge/src/**/*.test.ts",
        "src/test-utils/**",
        "src/swagger2openapi.d.ts",
      ],
    },
  },
});
