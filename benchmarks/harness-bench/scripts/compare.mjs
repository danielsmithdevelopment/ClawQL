#!/usr/bin/env node
import { Effect } from "effect";
import { compareHarnesses } from "../../../packages/clawql-harness/dist/bench/harness-bench.js";
import { OuroborosPlugin } from "../../../packages/clawql-harness/dist/plugins/ouroboros/index.js";
import { OpenCode2Plugin } from "../../../packages/clawql-harness/dist/plugins/opencode2/index.js";

const comparison = await Effect.runPromise(
  compareHarnesses({
    task: { id: "harness-smoke", title: "Harness plugin compare smoke", maxTurns: 1 },
    model: { provider: "stub", name: "bench-model" },
    plugins: [OuroborosPlugin, OpenCode2Plugin],
  })
);

console.log(JSON.stringify(comparison, null, 2));

const ouro = comparison.plugins.find((p) => p.pluginId === "clawql-ouroboros");
if (!ouro?.result.wormComplete) {
  process.exit(1);
}
