#!/usr/bin/env node
/**
 * Compatibility entry for Executor v2 multiturn.
 *
 * Do NOT measure v2 with a separate recipe. This wrapper always runs the same
 * harness as Executor v1: `runExecutorArm` inside gateway-multi-multiturn.mjs
 * (fat execute fixture, discovery=0, same tokenizer / turns / iters).
 *
 *   EXECUTOR_V2_URL=http://127.0.0.1:4312/mcp \
 *   EXECUTOR_V2_API_KEY=… EXECUTOR_V2_PID=… \
 *   MT_ITERS=10000 MT_TURNS=12 \
 *   npm run benchmark:executor-v2-multiturn
 *
 * Default artifact name is the equal-harness board (not the old skewed OUT).
 */
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const HARNESS = join(ROOT, "scripts", "benchmarks", "gateway-multi-multiturn.mjs");

const env = {
  ...process.env,
  MT_ARMS: "executor_v2",
  MT_OUT: process.env.MT_OUT || "gateway-multi-multiturn-executor-v2-equal-10k.json",
};

console.log(
  "[executor-v2-multiturn] Redirecting to equal-arm harness:",
  "MT_ARMS=executor_v2 → gateway-multi-multiturn.mjs (same runExecutorArm as v1)"
);
console.log(`[executor-v2-multiturn] MT_OUT=${env.MT_OUT}`);

const child = spawn(process.execPath, [HARNESS], {
  cwd: ROOT,
  env,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
