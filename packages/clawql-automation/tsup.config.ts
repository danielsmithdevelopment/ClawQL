import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "notify/notify": "src/notify/notify.ts",
    "schedule/schedule": "src/schedule/schedule.ts",
    "workflow/workflow": "src/workflow/workflow.ts",
    "workflow/vault-digest/run-vault-digest": "src/workflow/vault-digest/run-vault-digest.ts",
    "workflow/vault-digest/cli": "src/workflow/vault-digest/cli.ts",
    "plugin/index": "src/plugin/index.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
});
