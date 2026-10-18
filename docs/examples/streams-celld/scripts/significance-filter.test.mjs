#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  decideSignificance,
  evaluateSignificance,
  getJsonPath,
} from "../src/significance-filter.js";

assert.equal(getJsonPath({ a: { b: 3 } }, "$.a.b"), 3);
assert.equal(getJsonPath({ score: 10 }, "score"), 10);

const always = evaluateSignificance({ type: "always" }, "{}");
assert.equal(always.significant, true);

const never = evaluateSignificance({ type: "never" }, '{"x":1}');
assert.equal(never.significant, false);

const thrPass = evaluateSignificance(
  { type: "threshold", path: "$.score", op: "gte", value: 5 },
  JSON.stringify({ score: 5 })
);
assert.equal(thrPass.significant, true);
assert.match(thrPass.reason, /pass/);

const thrFail = evaluateSignificance(
  { type: "threshold", path: "score", op: "gt", value: 10 },
  JSON.stringify({ score: 3 })
);
assert.equal(thrFail.significant, false);

const pat = evaluateSignificance(
  { type: "pattern", path: "$.status", pattern: "degraded|down" },
  JSON.stringify({ status: "degraded" })
);
assert.equal(pat.significant, true);

const t0 = 1_000_000;
const r1 = evaluateSignificance(
  { type: "rate", windowSec: 10, count: 3 },
  "{}",
  {},
  { now: t0, rateTimestamps: [] }
);
assert.equal(r1.significant, false);
assert.equal(r1.eventsInWindow, 1);
const r2 = evaluateSignificance(
  { type: "rate", windowSec: 10, count: 3 },
  "{}",
  {},
  { now: t0 + 1000, rateTimestamps: r1.rateTimestamps }
);
assert.equal(r2.significant, false);
const r3 = evaluateSignificance(
  { type: "rate", windowSec: 10, count: 3 },
  "{}",
  {},
  { now: t0 + 2000, rateTimestamps: r2.rateTimestamps }
);
assert.equal(r3.significant, true);
assert.equal(r3.reason, "rate_threshold_met");

const compAnd = evaluateSignificance(
  {
    type: "composite",
    op: "and",
    filters: [
      { type: "threshold", path: "score", op: "gte", value: 5 },
      { type: "pattern", path: "status", pattern: "ok|degraded" },
    ],
  },
  JSON.stringify({ score: 9, status: "ok" })
);
assert.equal(compAnd.significant, true);

const compOrFail = evaluateSignificance(
  {
    type: "composite",
    op: "or",
    filters: [
      { type: "never" },
      { type: "threshold", path: "score", op: "gt", value: 100 },
    ],
  },
  JSON.stringify({ score: 1 })
);
assert.equal(compOrFail.significant, false);

const fromBody = decideSignificance(
  JSON.stringify({ significance: { type: "never" }, probe: true })
);
assert.equal(fromBody.significant, false);
assert.equal(fromBody.filterType, "never");

const def = decideSignificance('{"probe":true}');
assert.equal(def.significant, true);
assert.equal(def.filterType, "default");

console.log("significance-filter.test: PASS");
