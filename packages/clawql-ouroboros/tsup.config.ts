import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/mcp-hooks.ts", "src/poller.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
});
