import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "notify/notify": "src/notify/notify.ts",
    "schedule/schedule": "src/schedule/schedule.ts",
    "workflow/workflow": "src/workflow/workflow.ts",
    "workflow/suspend-resume": "src/workflow/suspend-resume.ts",
    "argocd/argocd": "src/argocd/argocd.ts",
    "nats/env": "src/nats/env.ts",
    "nats/publish-hooks": "src/nats/publish-hooks.ts",
    "nats/cli": "src/nats/cli.ts",
    "nats/bootstrap-cli": "src/nats/bootstrap-cli.ts",
    "workflow/vault-digest/run-vault-digest": "src/workflow/vault-digest/run-vault-digest.ts",
    "workflow/vault-digest/cli": "src/workflow/vault-digest/cli.ts",
    "plugin/index": "src/plugin/index.ts",
    "hitl/label-studio": "src/hitl/label-studio.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
});
