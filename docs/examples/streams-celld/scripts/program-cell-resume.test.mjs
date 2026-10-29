#!/usr/bin/env node
/**
 * Unit tests for ProgramCellDO resume decision (no celld required).
 */
import assert from "node:assert/strict";
import {
  canonicalizeForHash,
  decideCallResume,
  entryMatchesCall,
  isWriteCall,
  journaledArgs,
} from "../src/program-cell-resume.js";

assert.equal(
  decideCallResume({ hasEntry: true, hasIntent: false, isWrite: false }).action,
  "replay"
);
assert.equal(decideCallResume({ hasEntry: true, hasIntent: true, isWrite: true }).action, "replay");
assert.equal(
  decideCallResume({ hasEntry: false, hasIntent: true, isWrite: true }).action,
  "outcome_unknown"
);
assert.equal(
  decideCallResume({
    hasEntry: false,
    hasIntent: true,
    isWrite: true,
    intentHasUpstreamResult: true,
  }).action,
  "finalize_upstream"
);
assert.equal(
  decideCallResume({
    hasEntry: false,
    hasIntent: false,
    isWrite: true,
    intentHasUpstreamResult: true,
  }).action,
  "finalize_upstream"
);
assert.equal(
  decideCallResume({
    hasEntry: true,
    hasIntent: true,
    isWrite: true,
    intentHasUpstreamResult: true,
  }).action,
  "replay"
);
assert.equal(
  decideCallResume({ hasEntry: false, hasIntent: false, isWrite: false }).action,
  "rerun"
);
assert.equal(
  decideCallResume({ hasEntry: false, hasIntent: false, isWrite: true }).action,
  "rerun"
);
assert.equal(
  decideCallResume({ hasEntry: false, hasIntent: true, isWrite: false }).action,
  "rerun"
);
// Peer missing intent key but meta.pauseKind says write already past intent → do not re-send.
assert.equal(
  decideCallResume({
    hasEntry: false,
    hasIntent: false,
    isWrite: true,
    pauseKind: "after_intent_before_call",
    pausedAtIndex: 2,
    callIndex: 2,
  }).action,
  "outcome_unknown"
);
assert.equal(
  decideCallResume({
    hasEntry: false,
    hasIntent: false,
    isWrite: true,
    pauseKind: "during_call",
    pausedAtIndex: 2,
    callIndex: 2,
  }).action,
  "outcome_unknown"
);
assert.equal(
  decideCallResume({
    hasEntry: false,
    hasIntent: false,
    isWrite: true,
    pauseKind: "after_call_before_journal",
    pausedAtIndex: 2,
    callIndex: 2,
  }).action,
  "outcome_unknown"
);
assert.equal(
  decideCallResume({
    hasEntry: false,
    hasIntent: false,
    isWrite: true,
    pauseKind: "before_intent",
    pausedAtIndex: 2,
    callIndex: 2,
  }).action,
  "rerun"
);

assert.equal(isWriteCall({ risk: "write" }), true);
assert.equal(isWriteCall({ risk: "read", method: "POST" }), false);
assert.equal(isWriteCall({ method: "POST" }), true);
assert.equal(isWriteCall({ method: "GET" }), false);

// Digest hard-stop: forged / divergent journal entry must not replay or continue.
assert.equal(
  decideCallResume({
    hasEntry: true,
    hasIntent: false,
    isWrite: true,
    entryMatches: false,
  }).action,
  "journal_divergence"
);
assert.equal(
  decideCallResume({
    hasEntry: true,
    hasIntent: false,
    isWrite: false,
    entryMatches: true,
  }).action,
  "replay"
);

const call = {
  tool: "execute",
  operationId: "pets.createPet",
  method: "POST",
  risk: "write",
  args: { name: "Ada", tags: ["a", "b"] },
};
const matchingEntry = {
  index: 1,
  callId: "c1",
  tool: "execute",
  operationId: "pets.createPet",
  args: { tags: ["a", "b"], name: "Ada" }, // key order differs — canonicalize
};
assert.equal(entryMatchesCall(matchingEntry, call, 1), true);
assert.equal(canonicalizeForHash(matchingEntry.args), canonicalizeForHash(journaledArgs(call)));

const forgedArgs = {
  ...matchingEntry,
  args: { name: "Ada", tags: ["a", "b"], extra: "forged" },
};
assert.equal(entryMatchesCall(forgedArgs, call, 1), false);

const forgedOp = { ...matchingEntry, operationId: "pets.deletePet" };
assert.equal(entryMatchesCall(forgedOp, call, 1), false);

const forgedCallId = { ...matchingEntry, callId: "c99" };
assert.equal(entryMatchesCall(forgedCallId, call, 1), false);

const sleepCall = { tool: "sleep", durationMs: 250 };
const sleepEntry = {
  index: 2,
  callId: "c2",
  tool: "sleep",
  args: { durationMs: 250 },
};
assert.equal(entryMatchesCall(sleepEntry, sleepCall, 2), true);
assert.equal(
  canonicalizeForHash(journaledArgs(sleepCall)),
  canonicalizeForHash({ durationMs: 250 })
);
assert.equal(entryMatchesCall({ ...sleepEntry, args: { durationMs: 999 } }, sleepCall, 2), false);

console.log("program-cell-resume.test: PASS");
