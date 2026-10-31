import assert from "node:assert/strict";
import {
  compareDigestStepState,
  projectDigestSteps,
} from "../src/program-cell-step-state.js";

const sharedOwner = {
  ok: true,
  status: "ok",
  value: { id: "owner_seed_1", name: "seed_1", host: "mock-pets-upstream", key: "seed_1" },
};

const baseline = [
  {
    index: 0,
    tool: "execute",
    operationId: "listPets",
    ok: true,
    status: "ok",
    result: { ok: true, status: "ok", value: { pets: [{ id: 1, name: "celld-core" }] } },
  },
  {
    index: 1,
    tool: "await_approval",
    ok: true,
    status: "approved",
    result: { ok: true, status: "approved" },
  },
  {
    index: 2,
    tool: "execute",
    operationId: "owners.create",
    ok: true,
    status: "ok",
    result: sharedOwner,
  },
];

const observed = [
  {
    index: 0,
    tool: "execute",
    operationId: "listPets",
    result: {
      ok: true,
      status: "ok",
      value: { pets: [{ id: 1, name: "celld-core" }] },
      completedAt: "2026-01-01T00:00:00.000Z",
    },
    replayed: true,
  },
  {
    index: 1,
    tool: "await_approval",
    result: { ok: true, status: "approved" },
    replayed: true,
  },
  {
    index: 2,
    tool: "execute",
    operationId: "owners.create",
    result: { ...sharedOwner, finalizedFromIntent: true },
  },
];

const cmp = compareDigestStepState(baseline, observed);
assert.equal(cmp.preserved, true, "resume flags must not break digest equality");
assert.deepEqual(cmp.mismatchIndexes, []);

const divergedBody = compareDigestStepState(baseline, [
  ...observed.slice(0, 2),
  {
    index: 2,
    tool: "execute",
    operationId: "owners.create",
    result: {
      ok: true,
      status: "ok",
      value: { id: "owner_OTHER", name: "seed_1", host: "mock-pets-upstream", key: "seed_1" },
    },
  },
]);
assert.equal(divergedBody.preserved, false, "different result body must fail digest equality");
assert.deepEqual(divergedBody.mismatchIndexes, [2]);

const badStatus = compareDigestStepState(baseline, [
  ...observed.slice(0, 2),
  {
    index: 2,
    tool: "execute",
    operationId: "owners.create",
    result: { ok: false, status: "error" },
  },
]);
assert.equal(badStatus.preserved, false);
assert.deepEqual(badStatus.mismatchIndexes, [2]);

assert.equal(projectDigestSteps(baseline).length, 3);

const withResults = compareDigestStepState(
  baseline,
  observed,
  { calls: 3, ok: true },
  { calls: 3, ok: true }
);
assert.equal(withResults.preserved, true);
assert.equal(withResults.resultMatch, true);

const badProgramResult = compareDigestStepState(
  baseline,
  observed,
  { calls: 3, ok: true },
  { calls: 3, ok: false }
);
assert.equal(badProgramResult.preserved, false);
assert.equal(badProgramResult.resultMatch, false);

console.log("program-cell-step-state.test: PASS");
