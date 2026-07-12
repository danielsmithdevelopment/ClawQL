import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "stripe/index": "src/stripe/index.ts",
    "x402/index": "src/x402/index.ts",
    "plans/index": "src/plans/index.ts",
    "audit/index": "src/audit/index.ts",
    "discovery/index": "src/discovery/index.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
});
