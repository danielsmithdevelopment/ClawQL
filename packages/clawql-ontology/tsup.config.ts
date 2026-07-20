import { defineConfig } from "tsup";

/** Library + plugin entries. */
const library = defineConfig({
  entry: {
    index: "src/index.ts",
    "plugin/index": "src/plugin/index.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
});

/** CLI entry — shebang for `bin` / `node dist/cli.js`. */
const cli = defineConfig({
  entry: {
    cli: "src/cli.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: false,
  banner: {
    js: "#!/usr/bin/env node",
  },
});

export default [library, cli];
