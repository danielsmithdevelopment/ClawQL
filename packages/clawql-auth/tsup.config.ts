import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts" },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  platform: "node",
  // Keep Node builtins out of the bundle. esbuild rewrites `node:sqlite` → `sqlite`
  // unless both are external; clawql-api then fails to resolve when noExternal'ing us.
  external: ["node:sqlite", "sqlite"],
});
