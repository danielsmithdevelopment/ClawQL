import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    paths: "src/paths.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  platform: "node",
  external: ["effect"],
});
