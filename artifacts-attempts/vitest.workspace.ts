import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  "packages/*/vitest.config.ts",
  "workers/*/vitest.config.ts",
  "demo/webhooks-service/vitest.config.ts",
]);
