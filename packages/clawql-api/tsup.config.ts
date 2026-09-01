import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "mcp/tool-shape-log": "src/mcp/tool-shape-log.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  noExternal: ["clawql-auth"],
  // Node built-in used by clawql-auth SQLite SecretStore — leave unresolved in the bundle.
  // express-rate-limit (and express) are clawql-auth HTTP peers — must stay external so
  // clawql-api's ESM bundle does not inline `debug` → dynamic require("tty").
  // clawql-audit (and its cbor/qrcode stack) must stay external — if bundled, cbor's
  // CommonJS `require("stream")` blows up under ESM (npm pack + Docker /healthz smoke).
  external: [
    "node:sqlite",
    "sqlite",
    "express-rate-limit",
    "express",
    "clawql-audit",
    "clawql-merkle",
    "cbor",
    "qrcode",
  ],
});
