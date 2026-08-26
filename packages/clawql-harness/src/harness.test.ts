import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ClawQLHarness, invokeHarnessTool } from "../src/index.js";
import { OuroborosPlugin } from "../plugins/ouroboros/index.js";
import { OpenCode2Plugin } from "../plugins/opencode2/index.js";
import { compareHarnesses } from "../bench/harness-bench.js";
import { detectStagnation, StagnationPattern } from "../plugins/ouroboros/stagnation.js";

describe("ClawQLHarness core", () => {
  it("runs zero-plugin baseline", async () => {
    const harness = await Effect.runPromise(
      ClawQLHarness.create({
        plugins: [],
        model: { provider: "stub", name: "test-model" },
      })
    );
    const result = await Effect.runPromise(
      harness.run({ id: "t1", title: "baseline smoke", maxTurns: 1 })
    );
    await Effect.runPromise(harness.teardown());
    expect(result.registeredTools).toEqual([]);
    expect(result.turns).toBe(1);
  });

  it("registers Ouroboros clawql_think + ouroboros_* and completes WORM verify", async () => {
    const harness = await Effect.runPromise(
      ClawQLHarness.create({
        plugins: [OuroborosPlugin],
        model: { provider: "stub", name: "test-model" },
      })
    );
    expect(harness.state.tools.has("clawql_think")).toBe(true);
    expect(harness.state.tools.has("ouroboros_create_seed_from_document")).toBe(true);
    expect(harness.state.tools.has("ouroboros_run_evolutionary_loop")).toBe(true);
    expect(harness.state.tools.has("ouroboros_get_lineage_status")).toBe(true);
    expect(harness.state.tools.has("ouroboros_measure_drift")).toBe(true);

    const result = await Effect.runPromise(
      harness.run({ id: "t2", title: "ouroboros smoke", maxTurns: 1 })
    );
    const think = await Effect.runPromise(
      invokeHarnessTool(harness.state, "clawql_think", { reasoning: "step 1" }).pipe(
        Effect.provide(harness.layer)
      )
    );
    expect(think).toEqual({ acknowledged: true });
    await Effect.runPromise(harness.teardown());
    expect(result.registeredTools).toContain("clawql_think");
    expect(result.registeredTools).toContain("ouroboros_run_evolutionary_loop");
    expect(result.wormComplete).toBe(true);
  });
});

describe("Ouroboros stagnation", () => {
  it("detects spinning from repeated evaluate hashes", () => {
    const history = [
      { turn: 1, phase: "evaluate" as const, outputHash: "same" },
      { turn: 2, phase: "evaluate" as const, outputHash: "same" },
    ];
    expect(detectStagnation(history)).toBe(StagnationPattern.SPINNING);
  });
});

describe("compareHarnesses", () => {
  it("compares baseline vs Ouroboros plugin", async () => {
    const dir = await mkdtemp(join(tmpdir(), "clawql-harness-bench-"));
    try {
      const comparison = await Effect.runPromise(
        compareHarnesses({
          task: { id: "bench-1", title: "harness compare", maxTurns: 1 },
          model: { provider: "stub", name: "nemotron-stub" },
          plugins: [OuroborosPlugin, OpenCode2Plugin],
          wormDbPath: join(dir, "worm.db"),
        })
      );
      expect(comparison.baseline.registeredTools).toEqual([]);
      expect(comparison.plugins.map((p) => p.pluginId).sort()).toEqual([
        "clawql-ouroboros",
        "opencode2",
      ]);
      expect(comparison.plugins.find((p) => p.pluginId === "clawql-ouroboros")?.result.wormComplete).toBe(
        true
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
