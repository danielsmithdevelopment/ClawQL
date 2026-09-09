import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  GatewayRegistryService,
  gatewayRegistryLiveLayer,
  gatewayRegistryMemoryLayer,
  statusFromLastSeen,
  GATEWAY_HEARTBEAT_INTERVAL_MS,
} from "./index.js";
import { joinMesh } from "../headscale/node-registration.js";

describe("statusFromLastSeen", () => {
  it("marks healthy / degraded / offline by missed intervals", () => {
    const now = 1_000_000;
    const interval = GATEWAY_HEARTBEAT_INTERVAL_MS;
    expect(statusFromLastSeen(new Date(now).toISOString(), now, interval)).toBe("healthy");
    expect(statusFromLastSeen(new Date(now - interval * 1.5).toISOString(), now, interval)).toBe(
      "degraded"
    );
    expect(statusFromLastSeen(new Date(now - interval * 3).toISOString(), now, interval)).toBe(
      "offline"
    );
  });
});

describe("GatewayRegistryService", () => {
  it("registers, lists, and heartbeats in memory", async () => {
    const program = Effect.gen(function* () {
      const reg = yield* GatewayRegistryService;
      yield* reg.registerGateway({
        gatewayId: "gw-east",
        orgId: "acme",
        kind: "regional",
        meshIdentity: "us-east-1.clawql.local",
      });
      yield* reg.registerGateway({
        gatewayId: "gw-edge",
        orgId: "acme",
        kind: "edge",
        meshIdentity: "daniel@Mac-Mini",
        ownerDeveloper: "daniel",
      });
      const listed = yield* reg.listMeshPeers("acme");
      expect(listed).toHaveLength(2);
      expect(listed.map((g) => g.kind).sort()).toEqual(["edge", "regional"]);
      const beat = yield* reg.heartbeat("gw-east", "acme");
      expect(beat?.status).toBe("healthy");
      expect(yield* reg.listMeshPeers("other")).toEqual([]);
    });
    await Effect.runPromise(program.pipe(Effect.provide(gatewayRegistryMemoryLayer())));
  });

  it("persists org-scoped file store", async () => {
    const home = await mkdtemp(join(tmpdir(), "clawql-gw-reg-"));
    try {
      await Effect.runPromise(
        Effect.gen(function* () {
          const reg = yield* GatewayRegistryService;
          yield* reg.registerGateway({
            gatewayId: "n1",
            orgId: "org1",
            kind: "regional",
            meshIdentity: "n1.mesh",
          });
        }).pipe(Effect.provide(gatewayRegistryLiveLayer(home)))
      );
      const peers = await Effect.runPromise(
        Effect.gen(function* () {
          const reg = yield* GatewayRegistryService;
          return yield* reg.listMeshPeers("org1");
        }).pipe(Effect.provide(gatewayRegistryLiveLayer(home)))
      );
      expect(peers).toHaveLength(1);
      expect(peers[0]!.meshIdentity).toBe("n1.mesh");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});

describe("joinMesh registry wiring", () => {
  it("registers into gateway registry when orgId provided", async () => {
    const home = await mkdtemp(join(tmpdir(), "clawql-join-reg-"));
    try {
      const identity = await Effect.runPromise(
        joinMesh("local-node", {
          orgId: "acme",
          kind: "regional",
          home,
          skipRegistry: false,
        })
      );
      expect(identity.meshAddress).toBeTruthy();
      const peers = await Effect.runPromise(
        Effect.gen(function* () {
          const reg = yield* GatewayRegistryService;
          return yield* reg.listMeshPeers("acme");
        }).pipe(Effect.provide(gatewayRegistryLiveLayer(home)))
      );
      expect(peers.length).toBeGreaterThanOrEqual(1);
      expect(peers.some((p) => p.meshIdentity === identity.meshAddress)).toBe(true);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});
