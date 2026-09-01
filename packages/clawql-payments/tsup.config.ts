import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "stripe/index": "src/stripe/index.ts",
    "x402/index": "src/x402/index.ts",
    "plans/index": "src/plans/index.ts",
    "audit/index": "src/audit/index.ts",
    "discovery/index": "src/discovery/index.ts",
    "mpp/index": "src/mpp/index.ts",
    "plugin/index": "src/plugin/index.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  // clawql-audit (and its cbor/qrcode stack) must stay external — if bundled, cbor's
  // CommonJS `require("stream")` blows up under ESM (MCP Docker /healthz smoke).
  external: [/^clawql-/, "cbor", "qrcode", "debug", "express", "express-rate-limit"],
});
