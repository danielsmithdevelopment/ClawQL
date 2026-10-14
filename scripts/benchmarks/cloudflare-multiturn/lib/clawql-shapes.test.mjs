import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import jmespath from "jmespath";
import { buildExpectations, checkStep } from "./success-checks.mjs";
import {
  CLAWQL_STEP_SHAPES,
  modelWrittenShapeText,
  programPlanSource,
} from "./clawql-shapes.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(join(HERE, "../fixtures/recording.synthetic.json"), "utf8")
);

function bodyForPath(includes) {
  const call = fixture.calls.find((c) => (c.path || "").includes(includes));
  assert.ok(call, `fixture call for ${includes}`);
  return typeof call.body === "string" ? JSON.parse(call.body) : call.body;
}

const bodies = {
  1: bodyForPath("/zones") && fixture.calls.find((c) => c.path === "/zones"),
  2: fixture.calls.find((c) => c.path === `/zones/${fixture.auditZoneId}`),
  3: fixture.calls.find((c) => c.path.includes("/settings/ssl")),
  4: fixture.calls.find((c) => c.path.includes("/dns_records")),
  7: fixture.calls.find((c) => c.path.endsWith("/workers/scripts")),
  8: fixture.calls.find((c) => c.path.includes("/workers/scripts/") && c.path.endsWith("/settings")),
  9: fixture.calls.find((c) => c.path.includes("/workers/routes")),
  10: fixture.calls.find((c) => c.path.includes("/r2/buckets")),
  11: fixture.calls.find((c) => c.path.includes("/firewall/rules")),
};

describe("clawql observation-shaped where", () => {
  const expectations = buildExpectations(fixture.world);

  it("every step where yields a check-passing observation", () => {
    for (let step = 1; step <= 11; step++) {
      const shape = CLAWQL_STEP_SHAPES[step];
      const call =
        step <= 3
          ? bodies[step]
          : step <= 6
            ? bodies[4]
            : bodies[step];
      assert.ok(call, `call for step ${step}`);
      const body = typeof call.body === "string" ? JSON.parse(call.body) : call.body;
      const observed = jmespath.search(body, shape.where);
      const check = checkStep(step, observed, expectations);
      assert.equal(check.ok, true, `step ${step}: ${check.reason}`);
    }
  });

  it("program plan source is valid JSON with 11 execute calls", () => {
    const plan = JSON.parse(programPlanSource());
    assert.equal(plan.v, 1);
    assert.equal(plan.mode, "sequential");
    assert.equal(plan.calls.length, 11);
    assert.ok(plan.calls.every((c) => c.tool === "execute" && typeof c.where === "string"));
  });

  it("modelWrittenShapeText includes where (harness builds args only)", () => {
    const text = modelWrittenShapeText(CLAWQL_STEP_SHAPES[4]);
    assert.match(text, /length\(result/);
    assert.ok(text.length > 10);
  });
});
