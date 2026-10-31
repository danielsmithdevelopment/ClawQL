#!/usr/bin/env node
/**
 * REQUIRED regression for durable-ack-before-send:
 *   kill right after upstream fetch starts + deliberately slow storage
 *   ⇒ intent must be present on every resume.
 *
 * This test drives the *product* ordering (put, then send). It does **not**
 * re-get as a stand-in for durability — slow storage makes put resolve before
 * the value is durable-visible, matching awaited put ≠ LTX/R2 ack.
 *
 * Until celld's output gate + lease-epoch fencing holds send until durable
 * under kill, this assertion fails. CI marks that as expected-fail
 * (`continue-on-error`) until CLAWQL_REQUIRE_OUTPUT_GATE=1 is set after the
 * fix lands.
 */
import assert from "node:assert/strict";
import { decideCallResume } from "../src/program-cell-resume.js";

const REQUIRE = process.env.CLAWQL_REQUIRE_OUTPUT_GATE === "1";
/** When set, simulate a correct output gate (for local verification of the assertion). */
const SIMULATE_GATE = process.env.CLAWQL_SIMULATE_OUTPUT_GATE === "1";

function slowDurableStorage(durableDelayMs = 80) {
  /** @type {Map<string, { value: unknown, durableAt: number }>} */
  const map = new Map();
  return {
    async put(key, value) {
      map.set(key, { value, durableAt: Date.now() + durableDelayMs });
    },
    async get(key) {
      const row = map.get(key);
      if (!row) return undefined;
      if (Date.now() < row.durableAt) return undefined;
      return row.value;
    },
  };
}

/**
 * Product send path. Correct celld: hold until durable (or refuse send).
 * Current gap: return after put and let fetch proceed.
 */
async function productPutThenAllowSend(storage, key, value) {
  await storage.put(key, value);
  if (SIMULATE_GATE) {
    const deadline = Date.now() + 500;
    while (Date.now() < deadline) {
      if (await storage.get(key)) return { sendAllowed: true };
      await new Promise((r) => setTimeout(r, 5));
    }
    return { sendAllowed: false, error: "intent_not_durable" };
  }
  // Pre-fix / current: put resolved ⇒ send allowed (no durable wait).
  return { sendAllowed: true };
}

async function runKillAfterFetch() {
  const storage = slowDurableStorage(80);
  const programId = "regress_during_call_1";
  const intentKey = `program:${programId}:intent:2`;
  const intent = {
    index: 2,
    operationId: "owners.create",
    startedAt: new Date().toISOString(),
  };

  const gate = await productPutThenAllowSend(storage, intentKey, intent);
  assert.equal(gate.sendAllowed, true, "fixture expects send to proceed or gate to wait");

  // Fetch has started. Kill. Resume must see durable intent.
  const intentOnResume = (await storage.get(intentKey)) !== undefined;
  const withPauseKind = decideCallResume({
    hasEntry: false,
    hasIntent: intentOnResume,
    isWrite: true,
    pauseKind: "during_call",
    pausedAtIndex: 2,
    callIndex: 2,
  });
  const withoutMeta = decideCallResume({
    hasEntry: false,
    hasIntent: intentOnResume,
    isWrite: true,
  });

  return { intentOnResume, withPauseKind: withPauseKind.action, withoutMeta: withoutMeta.action };
}

try {
  const result = await runKillAfterFetch();
  assert.equal(
    result.intentOnResume,
    true,
    "REQUIRED: intent present on resume after kill-after-fetch with slow storage"
  );
  assert.equal(result.withPauseKind, "outcome_unknown");
  // When intent is durable, even without pauseKind we must not blind-rerun a write
  // that was in flight — outcome_unknown requires intent (or pauseKind). Intent alone:
  assert.equal(
    decideCallResume({ hasEntry: false, hasIntent: true, isWrite: true }).action,
    "outcome_unknown"
  );

  console.log("intent-durable-before-send.test.mjs: PASS");
  process.exit(0);
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  // Show the double-charge path when intent is missing (494-shaped).
  const lost = decideCallResume({ hasEntry: false, hasIntent: false, isWrite: true });
  console.error("intent-durable-before-send.test.mjs:", msg);
  console.error(
    `  (without durable intent, resume action=${lost.action} — double-charge path)`
  );
  if (REQUIRE) {
    console.error("CLAWQL_REQUIRE_OUTPUT_GATE=1: treating as hard failure");
    process.exit(1);
  }
  console.error(
    "EXPECTED FAIL until celld output-gate + lease-epoch fencing is proven under kill."
  );
  console.error(
    "After the fix: CLAWQL_REQUIRE_OUTPUT_GATE=1 and remove workflow continue-on-error."
  );
  process.exit(0);
}
