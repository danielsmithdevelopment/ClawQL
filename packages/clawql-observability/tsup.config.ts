import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    paths: "src/paths.ts",
    "plugin/index": "src/plugin/index.ts",
    "http/routes": "src/http/routes.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  platform: "node",
<<<<<<< HEAD
  external: [/^clawql-/, "effect", "cbor", "debug", "express", "express-rate-limit"],
=======
  external: ["effect", "clawql-api", "clawql-audit", "clawql-core", "zod"],
>>>>>>> 9399c425 (feat(observability): host integration runtime, MCP plugin, WORM bridge, HTTP API (v0.6))
});
