#!/usr/bin/env node
/**
 * Trace conformance: every write host-send must be preceded by a durable
 * intent ack in the same trial. Maps to ProgramResume IntentDurablyAckedBeforeSend.
 *
 * Usage:
 *   node scripts/formal/check-intent-durable-before-send.mjs [trace.json]
 *   (no args → run built-in fixtures, including a failing send-before-ack case)
 *
 * Trace shape (array of events, or { trials: [ { events | timeline } ] }):
 *   { type: "intent_journaled"|"intent_durable_ack"|"host_send"|"side_effect"|"crash", step?: number }
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SEND = new Set(["host_send", "send", "upstream_fetch_start", "execute_start"]);
const ACK = new Set(["intent_durable_ack", "durable_ack", "storage_durable", "ltx_acked"]);
const JOURNAL = new Set(["intent_journaled", "intent_put", "append_intent"]);

/**
 * @param {Array<{type:string, step?:number}>} events
 * @returns {{ ok: boolean, violations: string[] }}
 */
export function checkIntentDurableBeforeSend(events) {
  const violations = [];
  /** @type {Set<number|string>} */
  const journaled = new Set();
  /** @type {Set<number|string>} */
  const acked = new Set();
  let i = 0;
  for (const ev of events || []) {
    i += 1;
    const step = ev.step ?? "_";
    const t = String(ev.type || "");
    if (JOURNAL.has(t)) journaled.add(step);
    if (ACK.has(t)) {
      acked.add(step);
      journaled.add(step);
    }
    if (SEND.has(t)) {
      if (!acked.has(step)) {
        violations.push(
          `event[${i}] ${t} step=${String(step)} without prior intent_durable_ack ` +
            `(journaled=${journaled.has(step)})`
        );
      }
    }
  }
  return { ok: violations.length === 0, violations };
}

function loadTraces(path) {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  if (Array.isArray(raw)) return [{ id: "root", events: raw }];
  if (Array.isArray(raw.events)) return [{ id: "root", events: raw.events }];
  if (Array.isArray(raw.trials)) {
    return raw.trials.map((t, idx) => ({
      id: t.id ?? t.programId ?? `trial_${t.i ?? idx}`,
      events: t.events || t.timeline || [],
    }));
  }
  throw new Error("trace JSON must be an event array, {events}, or {trials:[{events}]}");
}

const fixtures = [
  {
    id: "ok-ack-before-send",
    events: [
      { type: "intent_journaled", step: 2 },
      { type: "intent_durable_ack", step: 2 },
      { type: "host_send", step: 2 },
      { type: "side_effect", step: 2 },
    ],
    expectOk: true,
  },
  {
    id: "fail-send-before-ack",
    events: [
      { type: "intent_journaled", step: 2 },
      { type: "host_send", step: 2 },
      { type: "crash" },
    ],
    expectOk: false,
  },
  {
    id: "fail-send-without-journal",
    events: [{ type: "host_send", step: 2 }],
    expectOk: false,
  },
  {
    id: "during-call-r2-settle-shape",
    // Models the N=1000 settle: fetch in flight, no durable ack ever observed.
    events: [
      { type: "intent_journaled", step: 2 },
      { type: "host_send", step: 2 },
      { type: "crash" },
    ],
    expectOk: false,
  },
];

function main() {
  const arg = process.argv[2];
  let failed = 0;

  if (arg) {
    for (const trial of loadTraces(arg)) {
      const r = checkIntentDurableBeforeSend(trial.events);
      if (!r.ok) {
        failed += 1;
        console.error(`FAIL ${trial.id}:`, r.violations.join("; "));
      } else {
        console.log(`ok ${trial.id}`);
      }
    }
  } else {
    for (const fix of fixtures) {
      const r = checkIntentDurableBeforeSend(fix.events);
      const pass = r.ok === fix.expectOk;
      if (!pass) {
        failed += 1;
        console.error(
          `FAIL fixture ${fix.id}: expected ok=${fix.expectOk} got ok=${r.ok}`,
          r.violations
        );
      } else {
        console.log(`ok fixture ${fix.id}`);
      }
    }
  }

  if (failed) {
    console.error(`check-intent-durable-before-send: ${failed} failure(s)`);
    process.exit(1);
  }
  console.log("check-intent-durable-before-send: OK");
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main();
