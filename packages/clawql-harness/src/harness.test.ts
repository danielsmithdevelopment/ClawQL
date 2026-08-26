import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
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

describe("OpenCode2Plugin", () => {
  it("registers opencode2_session and returns disabled error when embed forced off", async () => {
    const prev = process.env.CLAWQL_OPENCODE_DISABLE_EMBED;
    process.env.CLAWQL_OPENCODE_DISABLE_EMBED = "1";
    try {
      const harness = await Effect.runPromise(
        ClawQLHarness.create({
          plugins: [OpenCode2Plugin],
          model: { provider: "stub", name: "test-model" },
        })
      );
      expect(harness.state.tools.has("opencode2_session")).toBe(true);
      const out = (await Effect.runPromise(
        invokeHarnessTool(harness.state, "opencode2_session", { task: "smoke" }).pipe(
          Effect.provide(harness.layer)
        )
      )) as { ok?: boolean; error?: string };
      expect(out.ok).toBe(false);
      expect(out.error).toMatch(/OpenCode2 embed disabled|SDK not available|createOpencode failed/);
      await Effect.runPromise(harness.teardown());
    } finally {
      if (prev === undefined) delete process.env.CLAWQL_OPENCODE_DISABLE_EMBED;
      else process.env.CLAWQL_OPENCODE_DISABLE_EMBED = prev;
    }
  });

  it("runs live session.create + prompt when OpenCode peers are installed", async () => {
    const { access } = await import("node:fs/promises");
    const { createRequire } = await import("node:module");
    let hasPeers = false;
    try {
      const require = createRequire(import.meta.url);
      require.resolve("@opencode-ai/sdk/v2");
      const pkg = require.resolve("opencode-ai/package.json");
      await access(join(dirname(pkg), "bin/opencode.exe"));
      hasPeers = true;
    } catch {
      hasPeers = false;
    }
    if (!hasPeers) return;

    const harness = await Effect.runPromise(
      ClawQLHarness.create({
        plugins: [OpenCode2Plugin],
        model: { provider: "stub", name: "test-model" },
      })
    );
    const out = (await Effect.runPromise(
      invokeHarnessTool(harness.state, "opencode2_session", {
        task: "Reply with exactly: OPENCODE_CLAWQL_OK and nothing else.",
        title: "clawql-harness-vitest",
      }).pipe(Effect.provide(harness.layer))
    )) as {
      ok?: boolean;
      text?: string | null;
      error?: string;
      sessionId?: string;
      model?: { providerID: string; modelID: string };
    };
    await Effect.runPromise(harness.teardown());
    expect(out.ok).toBe(true);
    expect(out.sessionId).toMatch(/^ses_/);
    expect(out.model).toEqual({ providerID: "opencode", modelID: "big-pickle" });
    expect(out.text ?? "").toContain("OPENCODE_CLAWQL_OK");
  }, 120_000);
});
