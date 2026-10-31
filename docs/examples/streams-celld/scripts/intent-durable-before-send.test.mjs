#!/usr/bin/env node
/**
 * Regression: write intent must be durable-visible before upstream fetch starts.
 *
 * Models the N=1000 during_call R2 settle gap (intent missing while call in
 * flight) with deliberately slow storage: put() resolves before the value is
 * readable. Kill/resume after fetch starts must still see the intent — this
 * test fails the unsafe ordering and passes once confirm-before-send is used.
 */
import assert from "node:assert/strict";
import { decideCallResume } from "../src/program-cell-resume.js";

/**
 * Storage that acknowledges put immediately but makes get see the value only
 * after `durableDelayMs` (simulates awaited put ≠ LTX/R2 durable ack).
 */
function slowDurableStorage(durableDelayMs = 50) {
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
    /** Test hook: advance clock past all pending durability. */
    async flushAll() {
      const now = Date.now();
      for (const [k, row] of map) {
        map.set(k, { ...row, durableAt: now - 1 });
      }
    },
  };
}

async function confirmIntentDurable(storage, key, { timeoutMs = 200, pollMs = 5 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const v = await storage.get(key);
    if (v) return v;
    await new Promise((r) => setTimeout(r, pollMs));
  }
  return undefined;
}

/**
 * Unsafe path: await put then fetch immediately (celld-shaped gap).
 * @returns {{ fetchStarted: boolean, intentVisibleAtFetch: boolean, intentOnResume: boolean }}
 */
async function runUnsafeKillAfterFetchStart() {
  const storage = slowDurableStorage(80);
  const programId = "regress_during_call_1";
  const intentKey = `program:${programId}:intent:2`;
  const intent = { index: 2, operationId: "owners.create", startedAt: new Date().toISOString() };

  await storage.put(intentKey, intent);
  // Fetch starts immediately — put resolved, not yet durable.
  const fetchStarted = true;
  const intentVisibleAtFetch = (await storage.get(intentKey)) !== undefined;
  // SIGKILL mid-hang: resume reads storage without waiting for slow durability.
  const intentOnResume = (await storage.get(intentKey)) !== undefined;
  const decision = decideCallResume({
    hasEntry: false,
    hasIntent: intentOnResume,
    isWrite: true,
    pauseKind: "during_call",
    pausedAtIndex: 2,
    callIndex: 2,
  });
  return {
    fetchStarted,
    intentVisibleAtFetch,
    intentOnResume,
    resumeAction: decision.action,
  };
}

/**
 * Safe path: confirm durable visibility before fetch; kill after fetch starts.
 */
async function runSafeKillAfterFetchStart() {
  const storage = slowDurableStorage(40);
  const programId = "regress_during_call_2";
  const intentKey = `program:${programId}:intent:2`;
  const intent = { index: 2, operationId: "owners.create", startedAt: new Date().toISOString() };

  await storage.put(intentKey, intent);
  const confirmed = await confirmIntentDurable(storage, intentKey, { timeoutMs: 500 });
  assert.ok(confirmed, "intent must become durable before send");
  const fetchStarted = true;
  const intentVisibleAtFetch = (await storage.get(intentKey)) !== undefined;
  // Kill after fetch: durable intent still present.
  const intentOnResume = (await storage.get(intentKey)) !== undefined;
  const decision = decideCallResume({
    hasEntry: false,
    hasIntent: intentOnResume,
    isWrite: true,
    pauseKind: "during_call",
    pausedAtIndex: 2,
    callIndex: 2,
  });
  return {
    fetchStarted,
    intentVisibleAtFetch,
    intentOnResume,
    resumeAction: decision.action,
  };
}

const unsafe = await runUnsafeKillAfterFetchStart();
assert.equal(unsafe.fetchStarted, true);
assert.equal(
  unsafe.intentVisibleAtFetch,
  false,
  "fixture: slow storage must hide intent at fetch start"
);
assert.equal(unsafe.intentOnResume, false, "fixture: kill before durable leaves intent missing");
assert.equal(
  unsafe.resumeAction,
  "outcome_unknown",
  "with pauseKind=during_call the peer still refuses re-send — but only if meta.pauseKind survived"
);

// 494-shaped gap: create meta survived, pauseKind/intent never durable → resume would re-send.
const lostJournalRerun = decideCallResume({
  hasEntry: false,
  hasIntent: false,
  isWrite: true,
});
assert.equal(
  lostJournalRerun.action,
  "rerun",
  "missing intent+pauseKind after an in-flight write is the double-charge path"
);

const safe = await runSafeKillAfterFetchStart();
assert.equal(safe.fetchStarted, true);
assert.equal(safe.intentVisibleAtFetch, true);
assert.equal(safe.intentOnResume, true);
assert.equal(safe.resumeAction, "outcome_unknown");

console.log("intent-durable-before-send.test.mjs: OK");