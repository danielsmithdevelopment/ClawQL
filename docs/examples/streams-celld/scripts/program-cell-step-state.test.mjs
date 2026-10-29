import assert from "node:assert/strict";
import {
  compareStructuralStepState,
  projectStructuralSteps,
} from "../src/program-cell-step-state.js";

const baseline = [
  { index: 0, tool: "execute", operationId: "listPets", ok: true, status: "ok" },
  { index: 1, tool: "await_approval", ok: true, status: "approved" },
  { index: 2, tool: "execute", operationId: "owners.create", ok: true, status: "ok" },
];
const observed = [
  {
    index: 0,
    tool: "execute",
    operationId: "listPets",
    result: { ok: true, status: "ok", value: { pets: [] } },
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
    result: { ok: true, status: "ok", value: { id: "owner_volatile" } },
  },
];

const cmp = compareStructuralStepState(baseline, observed);
assert.equal(cmp.preserved, true, "volatile bodies must not break structural preserve");
assert.deepEqual(cmp.mismatchIndexes, []);

const bad = compareStructuralStepState(baseline, [
  ...observed.slice(0, 2),
  {
    index: 2,
    tool: "execute",
    operationId: "owners.create",
    result: { ok: false, status: "error" },
  },
]);
assert.equal(bad.preserved, false);
assert.deepEqual(bad.mismatchIndexes, [2]);

assert.equal(projectStructuralSteps(baseline).length, 3);
console.log("program-cell-step-state.test: PASS");
