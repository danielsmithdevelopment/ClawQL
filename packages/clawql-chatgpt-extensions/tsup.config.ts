import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "plugin/index": "src/plugin/index.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  external: [
    /^clawql-/,
    /^@modelcontextprotocol\//,
    "@openai/mcp-extensions",
    /^@openai\/mcp-extensions\//,
    "effect",
    "zod",
  ],
});
