import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "server/pageview": "src/server/pageview.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  platform: "node",
  external: ["clawql-audit", "clawql-auth", "effect", "posthog-node"],
});
