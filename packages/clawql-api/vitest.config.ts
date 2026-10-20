import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    /** Classify risk in fixtures without parking Slack/Onyx POSTs as mandate. */
    env: {
      CLAWQL_OPERATION_RISK_ENFORCE: "0",
      /** Opt out of product-default session IFC in unit fixtures; tests that need IFC set =1. */
      CLAWQL_ENABLE_SESSION_IFC: "0",
    },
  },
});
