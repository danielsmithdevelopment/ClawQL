import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "vault/config": "src/vault/config.ts",
    "vault/utils": "src/vault/utils.ts",
    "vault/slug-index": "src/vault/slug-index.ts",
    "ingest/slug": "src/ingest/slug.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
});
