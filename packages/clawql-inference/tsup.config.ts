import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "routing/index": "src/routing/index.ts",
    "api/server": "src/api/server.ts",
    "plugin/index": "src/plugin/index.ts",
    "audit/process-worm": "src/audit/process-worm.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
});
