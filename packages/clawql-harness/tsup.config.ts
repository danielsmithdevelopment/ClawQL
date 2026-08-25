import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "plugins/ouroboros/index": "plugins/ouroboros/index.ts",
    "plugins/opencode2/index": "plugins/opencode2/index.ts",
    "bench/harness-bench": "bench/harness-bench.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ["@opencode-ai/sdk", "@opencode-ai/plugin"],
});
