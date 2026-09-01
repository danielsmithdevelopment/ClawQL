import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    paths: "src/paths.ts",
    "plugin/index": "src/plugin/index.ts",
    "http/routes": "src/http/routes.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  platform: "node",
  external: [/^clawql-/, "effect", "cbor", "debug", "express", "express-rate-limit", "zod"],
});
