#!/usr/bin/env node
/** Validate a session observations JSON against fixture expectations. */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildExpectations, checkStep } from "./success-checks.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(HERE, "../fixtures/recording.synthetic.json");
const path = process.argv[2];
if (!path) {
  console.error("usage: check-real-session.mjs <observations.json>");
  process.exit(2);
}
const recording = JSON.parse(readFileSync(FIXTURE, "utf8"));
const expectations = buildExpectations(recording.world);
const observations = JSON.parse(readFileSync(path, "utf8"));
const steps = [];
let ok = true;
for (let step = 1; step <= 12; step++) {
  const check = checkStep(step, observations[String(step)] ?? observations[step], expectations);
  ok &&= check.ok;
  steps.push({ step, ok: check.ok, reason: check.reason || null });
}
console.log(JSON.stringify({ ok, steps }, null, 2));
process.exit(ok ? 0 : 1);
