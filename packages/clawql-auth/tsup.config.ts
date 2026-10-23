import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "gateway/index": "src/gateway/index.ts",
    "provider/index": "src/provider/index.ts",
    "siwe/index": "src/siwe/index.ts",
    "step-up/index": "src/step-up/index.ts",
    "api-keys/index": "src/api-keys/index.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  platform: "node",
  // Keep Node builtins out of the bundle. esbuild rewrites `node:sqlite` → `sqlite`
  // unless both are external; clawql-api then fails to resolve when noExternal'ing us.
  // jose / viem / step-up / api-keys: createRequire-loaded on first use — must stay
  // external so Ready gateway chunks do not inline them.
  external: [
    "node:sqlite",
    "sqlite",
    "viem",
    "jose",
    "clawql-auth/step-up",
    "clawql-auth/api-keys",
  ],
});
