import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/streams-slim.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  external: [/^clawql-/, "effect", "cbor", "debug", "express", "express-rate-limit"],
});
