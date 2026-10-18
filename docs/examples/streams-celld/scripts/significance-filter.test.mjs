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

const deferred = evaluateSignificance({ type: "rate", windowSec: 1, count: 3 }, "{}");
assert.equal(deferred.deferred, true);
assert.equal(deferred.significant, false);

const fromBody = decideSignificance(
  JSON.stringify({ significance: { type: "never" }, probe: true })
);
assert.equal(fromBody.significant, false);
assert.equal(fromBody.filterType, "never");

const def = decideSignificance('{"probe":true}');
assert.equal(def.significant, true);
assert.equal(def.filterType, "default");

console.log("significance-filter.test: PASS");
