import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "storage/sqlite": "src/storage/sqlite.ts",
    "storage/s3": "src/storage/s3.ts",
    "storage/memory": "src/storage/memory.ts",
    "storage/postgres": "src/storage/postgres.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  external: [
    "@aws-sdk/client-s3",
    "cbor",
    "clawql-merkle",
    "effect",
    "node:sqlite",
    "pg",
    "qrcode",
    "raptorq",
    "sqlite",
  ],
});
