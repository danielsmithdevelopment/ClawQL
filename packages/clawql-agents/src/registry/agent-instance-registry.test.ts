import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AgentInstanceRegistryService,
  agentInstanceRegistryLiveLayer,
  agentInstanceRegistryMemoryLayer,
  registerAgentInstanceOnStart,
  statusFromLastActive,
  AGENT_HEARTBEAT_INTERVAL_MS,
} from "./index.js";

describe("statusFromLastActive", () => {
  it("maps recency to active / idle / offline", () => {
    const now = 2_000_000;
    const i = AGENT_HEARTBEAT_INTERVAL_MS;
    expect(statusFromLastActive(new Date(now).toISOString(), now, i)).toBe("active");
    expect(statusFromLastActive(new Date(now - i * 1.5).toISOString(), now, i)).toBe("idle");
    expect(statusFromLastActive(new Date(now - i * 3).toISOString(), now, i)).toBe("offline");
  });
});

describe("AgentInstanceRegistryService", () => {
  it("registers, lists, heartbeats", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const reg = yield* AgentInstanceRegistryService;
        yield* reg.registerAgentInstance({
          agentId: "hermes-042",
          agentType: "hermes",
          parentGatewayId: "gw-east",
          orgId: "acme",
        });
        const listed = yield* reg.listAgentInstances("acme");
        expect(listed).toHaveLength(1);
        expect(listed[0]!.parentGatewayId).toBe("gw-east");
        const beat = yield* reg.heartbeat("hermes-042", "acme");
        expect(beat?.status).toBe("active");
      }).pipe(Effect.provide(agentInstanceRegistryMemoryLayer()))
    );
  });

  it("persists under org-scoped path", async () => {
    const home = await mkdtemp(join(tmpdir(), "clawql-agent-reg-"));
    try {
      await Effect.runPromise(
        Effect.gen(function* () {
          const reg = yield* AgentInstanceRegistryService;
          yield* reg.registerAgentInstance({
            agentId: "cline-1",
            agentType: "cline",
            parentGatewayId: "gw1",
            orgId: "org1",
          });
        }).pipe(Effect.provide(agentInstanceRegistryLiveLayer(home)))
      );
      const listed = await Effect.runPromise(
        Effect.gen(function* () {
          const reg = yield* AgentInstanceRegistryService;
          return yield* reg.listAgentInstances("org1");
        }).pipe(Effect.provide(agentInstanceRegistryLiveLayer(home)))
      );
      expect(listed[0]!.agentType).toBe("cline");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});

describe("registerAgentInstanceOnStart", () => {
  it("writes when org + gateway present", async () => {
    const home = await mkdtemp(join(tmpdir(), "clawql-agent-hook-"));
    try {
      await Effect.runPromise(
        registerAgentInstanceOnStart(
          {
            mcpEndpoint: "http://localhost/mcp",
            wormDbPath: join(home, "worm.db"),
            inferenceEndpoint: "http://localhost/inf",
            virtualKeyId: "vk",
            teeEnabled: false,
            orgId: "acme",
            parentGatewayId: "gw-east",
            agentInstanceId: "hermes-live-1",
            registryHome: home,
          },
          { agentId: "hermes-live-1", agentName: "hermes" }
        )
      );
      const listed = await Effect.runPromise(
        Effect.gen(function* () {
          const reg = yield* AgentInstanceRegistryService;
          return yield* reg.listAgentInstances("acme");
        }).pipe(Effect.provide(agentInstanceRegistryLiveLayer(home)))
      );
      expect(listed.some((a) => a.agentId === "hermes-live-1")).toBe(true);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});
