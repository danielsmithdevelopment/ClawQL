import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import {
  BurstOperatorService,
  BurstOperatorServiceLive,
  detectMeshAtrDrift,
  runBurstOperatorEffect,
} from "./index.js";

describe("detectMeshAtrDrift", () => {
  it("reports ok when sets match", async () => {
    const report = await Effect.runPromise(
      detectMeshAtrDrift(new Set(["svc-a"]), new Set(["svc-a"]))
    );
    expect(report.ok).toBe(true);
    expect(report.findings).toHaveLength(0);
  });

  it("flags under_restricts when mesh is wider than ATR", async () => {
    const report = await Effect.runPromise(
      detectMeshAtrDrift(new Set(["svc-a", "svc-b"]), new Set(["svc-a"]))
    );
    expect(report.ok).toBe(false);
    expect(report.findings.some((f) => f.kind === "under_restricts")).toBe(
      true
    );
  });

  it("flags over_restricts when mesh is narrower than ATR", async () => {
    const report = await Effect.runPromise(
      detectMeshAtrDrift(new Set(["svc-a"]), new Set(["svc-a", "svc-b"]))
    );
    expect(report.ok).toBe(false);
    expect(report.findings.some((f) => f.kind === "over_restricts")).toBe(true);
  });
});

describe("BurstOperatorService", () => {
  it("exposes worm entry types via Live layer", async () => {
    const types = await runBurstOperatorEffect(
      Effect.gen(function* () {
        const svc = yield* BurstOperatorService;
        return yield* svc.wormEntryTypes();
      })
    );
    expect(types).toContain("MESH_POLICY_DENIED");
    expect(types).toContain("FILLER_WORKLOAD_EVICTED");
  });

  it("detectDrift through Tag", async () => {
    const report = await Effect.runPromise(
      Effect.gen(function* () {
        const svc = yield* BurstOperatorService;
        return yield* svc.detectDrift(new Set(["x"]), new Set(["x"]));
      }).pipe(Effect.provide(BurstOperatorServiceLive))
    );
    expect(report.ok).toBe(true);
  });
});
