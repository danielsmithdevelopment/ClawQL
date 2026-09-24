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
    expect(types).toContain("THICC_SESSION_SPLIT");
    expect(types).toContain("CELL_PLACEMENT_LOAD_AWARE");
    expect(types).toContain("NEW_CAPACITY_PREFERRED_ROUTING");
    expect(types).toHaveLength(9);
  });

  it("places thicc sessions and prefers new capacity", async () => {
    const thicc = await runBurstOperatorEffect(
      Effect.gen(function* () {
        const svc = yield* BurstOperatorService;
        return yield* svc.placeSessionCell({
          sessionId: "s1",
          subscriptionId: "sub1",
          sessionSpawnCountOnPreferred: 8,
          preferredNodeId: "n1",
          thiccSessionThreshold: 5,
          nodes: [
            { nodeId: "n1", runningCellCount: 20, memoryUtil: 0.9 },
            { nodeId: "n2", runningCellCount: 2, memoryUtil: 0.2 },
          ],
        });
      })
    );
    expect(thicc.wormType).toBe("THICC_SESSION_SPLIT");
    expect(thicc.nodeId).toBe("n2");

    const fresh = await runBurstOperatorEffect(
      Effect.gen(function* () {
        const svc = yield* BurstOperatorService;
        return yield* svc.placeSessionCell({
          sessionId: "s2",
          subscriptionId: "sub2",
          sessionSpawnCountOnPreferred: 0,
          thiccSessionThreshold: 5,
          nodes: [
            { nodeId: "old", runningCellCount: 1, memoryUtil: 0.1 },
            {
              nodeId: "new",
              runningCellCount: 0,
              memoryUtil: 0.05,
              newlyProvisioned: true,
            },
          ],
        });
      })
    );
    expect(fresh.wormType).toBe("NEW_CAPACITY_PREFERRED_ROUTING");
    expect(fresh.nodeId).toBe("new");
  });

  it("bridges mesh denials to WORM-shaped payloads", async () => {
    const bridged = await runBurstOperatorEffect(
      Effect.gen(function* () {
        const svc = yield* BurstOperatorService;
        return yield* svc.bridgeMeshDenial({
          requestId: "r1",
          sourceIdentity: "spiffe://pay",
          destination: "audit-worm",
          layer: "waypoint",
          reason: "method deny",
          sessionId: "sess-1",
        });
      })
    );
    expect(bridged.wormType).toBe("MESH_POLICY_DENIED");
    expect(bridged.sessionId).toBe("sess-1");
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

describe("BurstWatchStub", () => {
  it("drains mesh denials and placement from an in-memory queue", async () => {
    const { BurstWatchStub, BurstWatchStubLive } = await import("./watches/index.js");
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const watches = yield* BurstWatchStub;
        yield* watches.enqueue({
          kind: "mesh_denial",
          event: {
            requestId: "r1",
            sourceIdentity: "spiffe://pay",
            destination: "audit-worm",
            layer: "waypoint",
            reason: "deny",
            sessionId: "s1",
          },
        });
        yield* watches.enqueue({
          kind: "node_load",
          nodes: [
            { nodeId: "n1", runningCellCount: 10, memoryUtil: 0.8 },
            { nodeId: "n2", runningCellCount: 1, memoryUtil: 0.1 },
          ],
        });
        return yield* watches.drain({
          atrAllows: new Set(["svc-a"]),
          meshAllows: new Set(["svc-a", "svc-b"]),
          placement: {
            sessionId: "s1",
            subscriptionId: "sub",
            sessionSpawnCountOnPreferred: 0,
            preferredNodeId: "n1",
            thiccSessionThreshold: 5,
            nodes: [{ nodeId: "n1", runningCellCount: 10, memoryUtil: 0.8 }],
          },
        });
      }).pipe(Effect.provide(BurstWatchStubLive))
    );
    expect(result.processed).toBe(2);
    expect(result.meshBridges[0]?.wormType).toBe("MESH_POLICY_DENIED");
    expect(result.driftReports[0]?.ok).toBe(false);
    expect(result.placements.length).toBeGreaterThan(0);
  });
});

describe("BurstWatchLoop + placement variance", () => {
  it("runs controller stack until idle", async () => {
    const { BurstWatchLoop, BurstWatchControllerLive } = await import("./watches/index.js");
    const ticks = await Effect.runPromise(
      Effect.gen(function* () {
        const loop = yield* BurstWatchLoop;
        yield* loop.enqueue({
          kind: "mesh_denial",
          event: {
            requestId: "r2",
            sourceIdentity: "spiffe://x",
            destination: "y",
            layer: "ztunnel",
            reason: "deny",
            sessionId: "s2",
          },
        });
        return yield* loop.runUntilIdle({
          atrAllows: new Set(["a"]),
          meshAllows: new Set(["a"]),
        });
      }).pipe(Effect.provide(BurstWatchControllerLive))
    );
    expect(ticks[0]?.processed).toBe(1);
    expect(ticks[0]?.meshBridges[0]?.wormType).toBe("MESH_POLICY_DENIED");
    expect(ticks.some((t) => t.processed === 0)).toBe(true);
  });

  it("simulates placement variance without inventing AWS numbers", async () => {
    const { simulatePlacementVariance } = await import("./placement-variance.js");
    const report = await Effect.runPromise(
      simulatePlacementVariance({
        sessions: 40,
        nodes: [
          { nodeId: "n1", runningCellCount: 5, memoryUtil: 0.4 },
          { nodeId: "n2", runningCellCount: 5, memoryUtil: 0.4 },
          { nodeId: "n3", runningCellCount: 1, memoryUtil: 0.1, newlyProvisioned: true },
        ],
      })
    );
    expect(report.samples).toBe(40);
    expect(report.uniqueNodes).toBeGreaterThan(0);
    expect(report.note).toMatch(/Simulation only/);
  });
});
