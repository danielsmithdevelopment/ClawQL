import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assembleInventoryCard,
  buildFanoutJoinProgramPlan,
  joinRoutesForWorkers,
} from "./fanout-join-shapes.mjs";
import { buildFanoutExpectations, checkInventoryCard } from "./fanout-join-checks.mjs";
import { FAKE } from "./fixture-ids.mjs";

test("parallel plan has six calls", () => {
  const plan = buildFanoutJoinProgramPlan();
  assert.equal(plan.return, true);
  assert.equal(plan.calls.length, 6);
  assert.ok(plan.calls.every((c) => c.operationId && c.where));
});

test("join routesForWorkers filters to known workers", () => {
  const { workers, routesForWorkers } = joinRoutesForWorkers({
    workers: ["edge-router", "other"],
    routes: [
      { script: "edge-router", pattern: "example.com/*" },
      { script: "ghost", pattern: "gone.example/*" },
    ],
  });
  assert.deepEqual(workers, ["edge-router", "other"]);
  assert.deepEqual(routesForWorkers, [{ script: "edge-router", pattern: "example.com/*" }]);
});

test("inventory card check against fixture world", async () => {
  const { readFileSync } = await import("node:fs");
  const { join, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const here = dirname(fileURLToPath(import.meta.url));
  const recording = JSON.parse(
    readFileSync(join(here, "../fixtures/recording.synthetic.json"), "utf8")
  );
  const exp = buildFanoutExpectations(recording.world);
  assert.equal(exp.ssl, recording.world.sslMode);
  assert.ok(exp.workers.includes(FAKE.workerScriptName));
  const card = assembleInventoryCard({
    ssl: { ssl: exp.ssl },
    dns: { aRecordCount: exp.aRecordCount },
    workers: { workers: exp.workers },
    routes: {
      routes: recording.world.routes.map((r) => ({ script: r.script, pattern: r.pattern })),
    },
    r2: { bucketNames: exp.bucketNames },
    fw: { enabledFirewallRules: exp.enabledFirewallRules },
  });
  const check = checkInventoryCard(card, exp);
  assert.equal(check.ok, true, check.reason);
});
