import assert from "node:assert/strict";
import { buildTrackBCellSchedule } from "./track_b_cell_schedule.mjs";

const prove = [{ id: "cg-prove-01" }, { id: "cg-prove-02" }];
const noHarm = [{ id: "cg-harm-01" }];
const arms = ["A-no-tools", "A-grep", "A-codegraph"];

const cells = buildTrackBCellSchedule({ proveKeys: prove, noHarmKeys: noHarm, arms });
const labels = cells.map((c) => `${c.phase}:${c.arm}:${c.key.id}`);

assert.deepEqual(labels, [
  "prove_beat_pairs:A-grep:cg-prove-01",
  "prove_beat_pairs:A-codegraph:cg-prove-01",
  "prove_beat_pairs:A-grep:cg-prove-02",
  "prove_beat_pairs:A-codegraph:cg-prove-02",
  "no_harm_beat_pairs:A-grep:cg-harm-01",
  "no_harm_beat_pairs:A-codegraph:cg-harm-01",
  "no_tools_baseline:A-no-tools:cg-prove-01",
  "no_tools_baseline:A-no-tools:cg-prove-02",
  "no_tools_baseline:A-no-tools:cg-harm-01",
]);

const resumed = buildTrackBCellSchedule({
  proveKeys: prove,
  noHarmKeys: noHarm,
  arms,
  done: new Set(["A-no-tools\tcg-prove-01", "A-grep\tcg-prove-01"]),
});
assert.equal(resumed[0].arm, "A-codegraph");
assert.equal(resumed[0].key.id, "cg-prove-01");
assert.ok(!resumed.some((c) => c.arm === "A-no-tools" && c.key.id === "cg-prove-01"));

console.log(JSON.stringify({ ok: true, n: cells.length, resume_pending: resumed.length }));
