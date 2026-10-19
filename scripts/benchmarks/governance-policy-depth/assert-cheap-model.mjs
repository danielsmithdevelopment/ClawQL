#!/usr/bin/env node
/**
 * Fail closed if OPENBENCH_MODEL / GOV_LIVE_MODEL is not on the cheap allowlist.
 * Usage: node assert-cheap-model.mjs [model-id]
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(
  readFileSync(join(__dirname, "cheap-model-allowlist.json"), "utf8")
);
const model = (process.argv[2] || process.env.GOV_LIVE_MODEL || process.env.OPENBENCH_MODEL || "")
  .trim()
  .toLowerCase();

if (!model) {
  console.error("assert-cheap-model: no model provided");
  process.exit(2);
}

const forbidden = (cfg.forbiddenSubstrings || []).some((s) =>
  model.includes(String(s).toLowerCase())
);
const allowed = (cfg.allowedOpenRouterModels || []).map((m) => m.toLowerCase());
const ok = !forbidden && allowed.includes(model);

if (!ok) {
  console.error(
    `assert-cheap-model: REJECTED model=${model}\n` +
      `Allowed: ${allowed.join(", ")}\n` +
      `Promise: live security/governance LLM cells use cheap OpenRouter only.`
  );
  process.exit(1);
}

console.log(`assert-cheap-model: OK model=${model}`);
process.exit(0);
