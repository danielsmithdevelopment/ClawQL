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
