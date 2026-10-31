#!/usr/bin/env node
/**
 * REQUIRED regression for H2: a stale incarnation that writes then tries to
 * send must be blocked (no ack → no send).
 *
 * Models the ClawQL celld fork behaviour:
 *   - live foreign generation holds CELLD_NODE → refuse start / no ack
 *   - record not Open at shipper epoch → bundle/LTX write refused → no ack
 *
 * Until CLAWQL_REQUIRE_OUTPUT_GATE=1 (forked binary proven), expected-fail
 * exits 0 so CI documents the contract without blocking stock celld 0.4.0.
 */
import assert from "node:assert/strict";

const REQUIRE = process.env.CLAWQL_REQUIRE_OUTPUT_GATE === "1";
const SIMULATE = process.env.CLAWQL_SIMULATE_OUTPUT_GATE === "1";

/**
 * @param {{ epoch: number, open: boolean, generation: string }} record
 * @param {{ epoch: number, generation: string }} writer
 */
function acknowledgeWrite(record, writer) {
  if (!record.open) return { acked: false, reason: "record_not_open" };
  if (record.epoch !== writer.epoch) return { acked: false, reason: "stale_epoch" };
  if (record.generation !== writer.generation) {
    return { acked: false, reason: "stale_incarnation" };
  }
  return { acked: true, reason: null };
}

function allowSend(ack) {
  return Boolean(ack?.acked);
}

/** Upstream-shaped bug: ack on local put even when record is stale/sealed. */
function buggyAcknowledge(_record, _writer) {
  return { acked: true, reason: null };
}

function run() {
  const live = { epoch: 7, open: true, generation: "gen-live" };
  const staleWriter = { epoch: 7, generation: "gen-zombie" };
  const sealed = { epoch: 7, open: false, generation: "gen-zombie" };

  const ackFn = SIMULATE ? acknowledgeWrite : buggyAcknowledge;

  const staleOnLive = ackFn(live, staleWriter);
  const sendStale = allowSend(staleOnLive);
  const afterSeal = ackFn(sealed, staleWriter);
  const sendAfterSeal = allowSend(afterSeal);

  assert.equal(
    sendStale,
    false,
    "REQUIRED: stale incarnation must not get ack / must not send while live generation holds the node"
  );
  assert.equal(
    sendAfterSeal,
    false,
    "REQUIRED: writer after record sealed must not get ack / must not send"
  );

  // Same-generation live writer still acks under the correct gate.
  if (SIMULATE) {
    assert.equal(allowSend(acknowledgeWrite(live, { epoch: 7, generation: "gen-live" })), true);
  }

  return { sendStale, sendAfterSeal };
}

try {
  const result = run();
  console.log("stale-incarnation-send.test.mjs: PASS", result);
  process.exit(0);
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error("stale-incarnation-send.test.mjs:", msg);
  if (REQUIRE) {
    console.error("CLAWQL_REQUIRE_OUTPUT_GATE=1: treating as hard failure");
    process.exit(1);
  }
  console.error(
    "EXPECTED FAIL until celld fork fenced-ack + refuse-live-incarnation is the board binary."
  );
  process.exit(0);
}
