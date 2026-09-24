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
    expect(report.findings.some((f) => f.kind === "under_restricts")).toBe(true);
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

  it("PodInformer unavailable double returns null via startPodInformerOrNull", async () => {
    const {
      BurstWatchStub,
      BurstWatchStubLive,
      UnavailablePodInformerLive,
      PodInformerService,
      startPodInformerOrNull,
    } = await import("./watches/index.js");
    const { Layer } = await import("effect");
    const handle = await Effect.runPromise(
      Effect.gen(function* () {
        const informer = yield* PodInformerService;
        const stub = yield* BurstWatchStub;
        return yield* startPodInformerOrNull(informer, stub, { namespace: "default" });
      }).pipe(Effect.provide(Layer.mergeAll(UnavailablePodInformerLive, BurstWatchStubLive)))
    );
    expect(handle).toBeNull();
  });
});

describe("IstioDenialWatch + KarpenterLifecycleWatch", () => {
  it("parses Envoy RBAC denial NDJSON into mesh_denial bridges", async () => {
    const { BurstWatchStub, BurstWatchStubLive, IstioDenialWatchLive, enqueueIstioNdjsonToStub } =
      await import("./watches/index.js");
    const { Layer } = await import("effect");
    const ndjson = [
      JSON.stringify({
        response_code: 200,
        path: "/ok",
        method: "GET",
        "source.principal": "spiffe://cluster.local/ns/a/sa/ok",
      }),
      JSON.stringify({
        response_code: 403,
        response_flags: "RBAC",
        response_code_details: "rbac_access_denied_matched_policy[ns[pay]-policy[deny]-rule[0]]",
        path: "/audit-worm",
        method: "POST",
        "source.principal": "spiffe://cluster.local/ns/pay/sa/agent",
        "destination.principal": "spiffe://cluster.local/ns/clawql/sa/audit",
        "x-request-id": "req-deny-1",
        "x-clawql-session-id": "sess-pay-1",
        reporter: "waypoint",
      }),
      JSON.stringify({
        response_code: 403,
        connection_termination_details: "denied_by_ztunnel",
        "source.principal": "spiffe://cluster.local/ns/x/sa/y",
        upstream_cluster: "outbound|8080||audit.clawql.svc.cluster.local",
        reporter: "ztunnel",
        request_id: "zt-1",
      }),
    ].join("\n");

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const stub = yield* BurstWatchStub;
        const enq = yield* enqueueIstioNdjsonToStub(stub, ndjson);
        const drained = yield* stub.drain();
        return { enq, drained };
      }).pipe(Effect.provide(Layer.mergeAll(IstioDenialWatchLive, BurstWatchStubLive)))
    );

    expect(result.enq.enqueued).toBe(2);
    expect(result.enq.skippedNonDenials).toBe(1);
    expect(result.drained.meshBridges).toHaveLength(2);
    expect(result.drained.meshBridges[0]?.wormType).toBe("MESH_POLICY_DENIED");
    expect(result.drained.meshBridges[0]?.sessionId).toBe("sess-pay-1");
    expect(result.drained.meshBridges[0]?.metadata.layer).toBe("waypoint");
    expect(result.drained.meshBridges[1]?.metadata.layer).toBe("ztunnel");
  });

  it("IstioAccessLogTail ingestFileOnce bridges denials from a real file", async () => {
    const { writeFileSync, mkdtempSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { tmpdir } = await import("node:os");
    const {
      BurstWatchStub,
      BurstWatchStubLive,
      IstioAccessLogTailStandaloneLive,
      IstioAccessLogTailService,
      UnavailableIstioAccessLogTailLive,
      startIstioAccessLogTailOrNull,
    } = await import("./watches/index.js");
    const { Layer } = await import("effect");
    const dir = mkdtempSync(join(tmpdir(), "istio-tail-"));
    const path = join(dir, "access.ndjson");
    writeFileSync(
      path,
      [
        JSON.stringify({
          response_code: 403,
          response_flags: "RBAC",
          "source.principal": "spiffe://cluster.local/ns/a/sa/x",
          "destination.principal": "spiffe://cluster.local/ns/b/sa/y",
          "x-request-id": "file-deny-1",
          reporter: "waypoint",
        }),
        "",
      ].join("\n")
    );

    const once = await Effect.runPromise(
      Effect.gen(function* () {
        const tail = yield* IstioAccessLogTailService;
        const stub = yield* BurstWatchStub;
        const ingested = yield* tail.ingestFileOnce(path);
        for (const ev of ingested.events) {
          yield* stub.enqueue(ev);
        }
        const drained = yield* stub.drain();
        return { ingested, drained };
      }).pipe(Effect.provide(Layer.mergeAll(IstioAccessLogTailStandaloneLive, BurstWatchStubLive)))
    );
    expect(once.ingested.events).toHaveLength(1);
    expect(once.drained.meshBridges).toHaveLength(1);
    expect(once.drained.meshBridges[0]?.metadata.requestId).toBe("file-deny-1");

    const nullHandle = await Effect.runPromise(
      Effect.gen(function* () {
        const tail = yield* IstioAccessLogTailService;
        const stub = yield* BurstWatchStub;
        return yield* startIstioAccessLogTailOrNull(tail, stub, {
          path: join(dir, "missing.ndjson"),
        });
      }).pipe(Effect.provide(Layer.mergeAll(UnavailableIstioAccessLogTailLive, BurstWatchStubLive)))
    );
    expect(nullHandle).toBeNull();
  });

  it("IstioAccessLogTail start fails closed when path missing", async () => {
    const { IstioAccessLogTailStandaloneLive, IstioAccessLogTailService } =
      await import("./watches/index.js");
    const { Layer } = await import("effect");
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const tail = yield* IstioAccessLogTailService;
        return yield* tail
          .start({
            path: "/tmp/clawql-istio-access-log-does-not-exist-088d.ndjson",
            onEvent: () => Effect.void,
          })
          .pipe(Effect.either);
      }).pipe(Effect.provide(IstioAccessLogTailStandaloneLive))
    );
    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left._tag).toBe("IstioAccessLogTailUnavailable");
    }
  });

  it("maps Karpenter provisioning and filler eviction into watch + WORM types", async () => {
    const {
      BurstWatchStub,
      BurstWatchStubLive,
      KarpenterLifecycleWatchLive,
      enqueueKarpenterRecordsToStub,
    } = await import("./watches/index.js");
    const { Layer } = await import("effect");
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const stub = yield* BurstWatchStub;
        const enq = yield* enqueueKarpenterRecordsToStub(stub, [
          { name: "nc-1", phase: "provisioning", nodeName: "ip-10-0-1-5" },
          {
            name: "filler-batch",
            phase: "disrupting",
            reason: "filler preempt for celld",
            fillerEviction: true,
            sessionId: "sess-fill",
          },
        ]);
        const drained = yield* stub.drain({
          placement: {
            sessionId: "sess-fill",
            subscriptionId: "sub",
            sessionSpawnCountOnPreferred: 0,
            thiccSessionThreshold: 5,
            nodes: [{ nodeId: "ip-10-0-1-5", runningCellCount: 0, memoryUtil: 0 }],
          },
        });
        return { enq, drained };
      }).pipe(Effect.provide(Layer.mergeAll(KarpenterLifecycleWatchLive, BurstWatchStubLive)))
    );

    expect(result.enq.enqueued).toBe(2);
    expect(result.enq.wormTypes).toContain("KARPENTER_NODE_REQUESTED");
    expect(result.enq.wormTypes).toContain("FILLER_WORKLOAD_EVICTED");
    expect(result.drained.processed).toBe(2);
    expect(result.drained.placements.length).toBeGreaterThan(0);
  });

  it("flags stale/missing celld S3 leases as CELLD_FLEET_NODE_DROPPED", async () => {
    const { BurstWatchStub, BurstWatchStubLive, CelldFleetHealthLive, enqueueFleetHealthToStub } =
      await import("./watches/index.js");
    const { Layer } = await import("effect");
    const now = 1_000_000;
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const stub = yield* BurstWatchStub;
        const report = yield* enqueueFleetHealthToStub(stub, {
          nowMs: now,
          defaultTtlMs: 30_000,
          expectedNodeIds: ["n1", "n2", "n3"],
          leases: [
            { nodeId: "n1", renewedAtMs: now - 5_000, ttlMs: 30_000 },
            { nodeId: "n2", renewedAtMs: now - 120_000, ttlMs: 30_000 },
          ],
        });
        const drained = yield* stub.drain();
        return { report, drained };
      }).pipe(Effect.provide(Layer.mergeAll(CelldFleetHealthLive, BurstWatchStubLive)))
    );

    expect(result.report.ok).toBe(false);
    expect(result.report.findings.map((f) => f.nodeId).sort()).toEqual(["n2", "n3"]);
    expect(result.report.findings.every((f) => f.wormType === "CELLD_FLEET_NODE_DROPPED")).toBe(
      true
    );
    expect(result.drained.processed).toBe(2);
  });
});
