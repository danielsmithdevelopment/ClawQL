import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/check-mistakes.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  external: [/^clawql-/, "@gdp-ts/core", "effect"],
});
