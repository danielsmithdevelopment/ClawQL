import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "ingest/external-ingest": "src/ingest/external-ingest.ts",
    "ingest/url-format": "src/ingest/url-format.ts",
    "plugin/index": "src/plugin/index.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  external: [/^clawql-/, "cbor", "debug", "express", "express-rate-limit"],
});
