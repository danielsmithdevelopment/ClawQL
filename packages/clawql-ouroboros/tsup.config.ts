import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "mcp-hooks": "src/mcp-hooks.ts",
    poller: "src/poller.ts",
    "plugin/index": "src/plugin/index.ts",
    "eval/index": "src/eval/index.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ["clawql-api", "clawql-core", "clawql-inference", "effect", "pg"],
});
