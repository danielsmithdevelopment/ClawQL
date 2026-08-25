import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  // CJS consumers need `import.meta.url` so sql.js can resolve its wasm file.
  shims: true,
});
