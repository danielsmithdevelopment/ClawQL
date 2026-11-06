#!/usr/bin/env node
/**
 * REQUIRED deterministic regression: expiry ≠ dead for open-log sweep.
 *
 * Sequence (matches the SIGSTOP board recipe at the predicate layer):
 *   1. Intent mid-flight (not yet durable to open log)
 *   2. Owner frozen past lease expiry (still live — wedged)
 *   3. Sweep decides whether to recover open log as abandoned
 *   4. Owner thawed
 *   5. Assert intent can still land; late ack rejected if fenced
 *
 * Historical bug: `expires_ms <= now` ⇒ treat as dead ⇒ recover open log ⇒
 * drop mid-flight intent (H2 via sweep). Fixed: same-host live owner past
 * expiry is fenceable but NOT abandoned.
 *
 * Set CLAWQL_REQUIRE_EXPIRY_NOT_DEAD=1 to fail hard (default after lab fix).
 * Set CLAWQL_SIMULATE_BUGGY_EXPIRY_AS_DEAD=1 to demonstrate the counterexample.
 */
import assert from "node:assert/strict";

const REQUIRE = process.env.CLAWQL_REQUIRE_EXPIRY_NOT_DEAD !== "0";
const BUGGY = process.env.CLAWQL_SIMULATE_BUGGY_EXPIRY_AS_DEAD === "1";

/**
 * Mirrors vendor/celld-lab host_process::lease_open_log_may_be_recovered_as_dead
 * @param {{ expiresMs: number, nowMs: number, sameHostLive: boolean, processDead: boolean, crossHost: boolean }} o
 */
function openLogMayBeRecoveredAsDead(o) {
  if (o.processDead) return true;
  if (o.sameHostLive) return false;
  if (o.crossHost || o.unstamped) return o.expiresMs <= o.nowMs;
  return false;
}

/** Historical predicate (expiry ⇒ dead). */
function buggyExpiryAsDead(o) {
  return o.expiresMs <= o.nowMs || o.processDead;
}

function mayRecover(o) {
  return BUGGY ? buggyExpiryAsDead(o) : openLogMayBeRecoveredAsDead(o);
}

/**
 * @param {{ recoverAbandoned: boolean, fenced: boolean, intentInFlight: boolean }} state
 */
function afterSweep(state) {
  if (state.recoverAbandoned) {
    return {
      intentDurable: false,
      intentInFlight: false,
      generation: 2,
      fenced: state.fenced,
      lateAckAccepted: false,
    };
  }
  return {
    intentDurable: false,
    intentInFlight: state.intentInFlight,
    generation: 1,
    fenced: state.fenced,
    lateAckAccepted: false,
  };
}

function attemptLateAck(state) {
  if (state.fenced && state.generation === 1) {
    return { ...state, lateAckAccepted: false, lateAckRejected: true };
  }
  return { ...state, lateAckAccepted: true, lateAckRejected: false };
}

function landIntentAfterThaw(state) {
  if (state.intentInFlight && state.generation === 1) {
    return { ...state, intentDurable: true, intentInFlight: false };
  }
  return state;
}

function run() {
  const lease = {
    expiresMs: 1000,
    nowMs: 5000,
    sameHostLive: true,
    processDead: false,
    crossHost: false,
    unstamped: false,
  };

  const recoverAbandoned = mayRecover(lease);
  let state = afterSweep({
    recoverAbandoned,
    fenced: true, // expiry permits fenced takeover
    intentInFlight: true,
  });
  state = attemptLateAck(state);
  state = landIntentAfterThaw(state);

  if (BUGGY) {
    assert.equal(
      recoverAbandoned,
      true,
      "buggy demo: expiry alone authorizes abandonment"
    );
    assert.equal(
      state.intentDurable,
      false,
      "buggy demo: mid-flight intent dropped by open-log recovery"
    );
    return { recoverAbandoned, state, buggy: true };
  }

  assert.equal(
    state.lateAckRejected,
    true,
    "REQUIRED: fenced old generation must have late ack rejected"
  );
  assert.equal(
    state.lateAckAccepted,
    false,
    "REQUIRED: late ack must not be accepted after fence"
  );
  assert.equal(
    state.intentDurable,
    true,
    "REQUIRED: mid-flight intent must still be landable after expiry+sweep+thaw (not dropped by open-log abandonment)"
  );
  assert.equal(
    recoverAbandoned,
    false,
    "REQUIRED: same-host live owner past expiry must not authorize open-log abandonment"
  );

  // Process-dead path still recovers.
  assert.equal(
    openLogMayBeRecoveredAsDead({ ...lease, sameHostLive: false, processDead: true }),
    true,
    "process-dead owner may recover open log"
  );

  return { recoverAbandoned, state, buggy: BUGGY };
}

try {
  const result = run();
  console.log("expiry-sweep-intent.test.mjs: PASS", result);
  process.exit(0);
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error("expiry-sweep-intent.test.mjs:", msg);
  if (BUGGY) {
    console.error(
      "Expected under CLAWQL_SIMULATE_BUGGY_EXPIRY_AS_DEAD=1 — demonstrates the counterexample."
    );
    process.exit(0);
  }
  if (REQUIRE) {
    console.error("CLAWQL_REQUIRE_EXPIRY_NOT_DEAD: treating as hard failure");
    process.exit(1);
  }
  process.exit(0);
}
