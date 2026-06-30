import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "notify/notify": "src/notify/notify.ts",
    "schedule/schedule": "src/schedule/schedule.ts",
    "plugin/index": "src/plugin/index.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
});
