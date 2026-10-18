#!/usr/bin/env node
/**
 * Unit tests for ProgramCellDO resume decision (no celld required).
 */
import assert from "node:assert/strict";
import { decideCallResume, isWriteCall } from "../src/program-cell-resume.js";

assert.equal(decideCallResume({ hasEntry: true, hasIntent: false, isWrite: false }).action, "replay");
assert.equal(decideCallResume({ hasEntry: true, hasIntent: true, isWrite: true }).action, "replay");
assert.equal(
  decideCallResume({ hasEntry: false, hasIntent: true, isWrite: true }).action,
  "outcome_unknown"
);
assert.equal(decideCallResume({ hasEntry: false, hasIntent: false, isWrite: false }).action, "rerun");
assert.equal(decideCallResume({ hasEntry: false, hasIntent: false, isWrite: true }).action, "rerun");
assert.equal(decideCallResume({ hasEntry: false, hasIntent: true, isWrite: false }).action, "rerun");

assert.equal(isWriteCall({ risk: "write" }), true);
assert.equal(isWriteCall({ risk: "read", method: "POST" }), false);
assert.equal(isWriteCall({ method: "POST" }), true);
assert.equal(isWriteCall({ method: "GET" }), false);

console.log("program-cell-resume.test: PASS");
