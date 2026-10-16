#!/usr/bin/env node
/**
 * Validate a fan-out real-model session card against fixture expectations.
 *
 *   node check-fanout-real-session.mjs <card.json>
 *
 * Card may be the inventory object, or `{ card: {…} }`, or wrap `result` from
 * execute_program compact return.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildFanoutExpectations, checkInventoryCard } from "./fanout-join-checks.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(HERE, "../fixtures/recording.synthetic.json");
const path = process.argv[2];
if (!path) {
  console.error("usage: check-fanout-real-session.mjs <card.json>");
  process.exit(2);
}
const recording = JSON.parse(readFileSync(FIXTURE, "utf8"));
const expectations = buildFanoutExpectations(recording.world);
const raw = JSON.parse(readFileSync(path, "utf8"));
let card = raw?.card ?? raw?.result ?? raw;
if (card && typeof card === "object" && card.return) card = card.return;
const check = checkInventoryCard(card, expectations);
console.log(JSON.stringify({ ok: check.ok, reason: check.reason || null, card }, null, 2));
process.exit(check.ok ? 0 : 1);
