import { createRequire } from "node:module";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const configDir = dirname(fileURLToPath(import.meta.url));
const graphqlMain = createRequire(import.meta.url).resolve("graphql");

/** CI unit job excludes `*.e2e.test.ts`. Run: `npx vitest run --config vitest.e2e.config.ts` */
export default defineConfig({
  root: configDir,
  resolve: {
    dedupe: ["graphql"],
    alias: { graphql: graphqlMain },
  },
  test: {
    environment: "node",
    env: {
      CLAWQL_OPERATION_RISK_ENFORCE: "0",
    },
    include: [
      "packages/mcp-api-adapter/src/**/*.e2e.test.ts",
      "packages/clawql-payments/src/**/*.e2e.test.ts",
      "packages/clawql-auth/src/**/*e2e*.test.ts",
    ],
    exclude: ["**/node_modules/**"],
    teardownTimeout: 30_000,
    disableConsoleIntercept: true,
    pool: "forks",
  },
});
