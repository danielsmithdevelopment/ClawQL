import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  // Same as clawql-api / clawql-payments: do not bundle clawql-audit → cbor into ESM.
  external: ["clawql-audit", "clawql-merkle", "cbor", "qrcode"],
});
