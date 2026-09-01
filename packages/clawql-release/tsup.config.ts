import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    cli: "src/cli.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  external: [/^clawql-/, "cbor", "debug", "express", "express-rate-limit"],
  banner: {
    js: "#!/usr/bin/env node",
  },
});
