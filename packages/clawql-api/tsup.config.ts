import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "mcp/tool-shape-log": "src/mcp/tool-shape-log.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  noExternal: ["clawql-auth"],
  // Node built-in used by clawql-auth SQLite SecretStore — leave unresolved in the bundle.
  external: ["node:sqlite", "sqlite"],
});
