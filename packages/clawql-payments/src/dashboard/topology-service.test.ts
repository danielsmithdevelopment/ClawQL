import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  GatewayRegistryService,
  gatewayRegistryLiveLayer,
} from "clawql-network";
import {
  AgentInstanceRegistryService,
  agentInstanceRegistryLiveLayer,
} from "clawql-agents";
import { aggregateTopologyFromRegistries } from "./topology-service.js";

describe("aggregateTopologyFromRegistries", () => {
  it("builds tree from Gap A + Gap B only (no ledger)", async () => {
    const home = await mkdtemp(join(tmpdir(), "clawql-topo-reg-"));
    const env = { CLAWQL_HOME: home } as NodeJS.ProcessEnv;
    try {
      await Effect.runPromise(
        Effect.gen(function* () {
          const gw = yield* GatewayRegistryService;
          yield* gw.registerGateway({
            gatewayId: "gw-east",
            orgId: "acme",
            kind: "regional",
            meshIdentity: "us-east-1",
          });
        }).pipe(Effect.provide(gatewayRegistryLiveLayer(home)))
      );
      await Effect.runPromise(
        Effect.gen(function* () {
          const agents = yield* AgentInstanceRegistryService;
          yield* agents.registerAgentInstance({
            agentId: "hermes-042",
            agentType: "hermes",
            parentGatewayId: "gw-east",
            orgId: "acme",
          });
        }).pipe(Effect.provide(agentInstanceRegistryLiveLayer(home)))
      );

      const tree = await Effect.runPromise(
        aggregateTopologyFromRegistries(
          { orgId: "acme", mcpUiTraceBase: "/mcp-ui/trace" },
          env
        )
      );
      expect(tree.empty).toBe(false);
      expect(tree.sources).toContain("gateway-registry");
      expect(tree.sources).toContain("agent-instance-registry");
      expect(tree.sources).not.toContain("compensation-accounts");
      expect(tree.gateways[0]!.children[0]!.agentId).toBe("hermes-042");
      expect(tree.gateways[0]!.children[0]!.traceLink).toContain("compare?focus=");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  it("empty when no gateways registered", async () => {
    const home = await mkdtemp(join(tmpdir(), "clawql-topo-empty-"));
    try {
      const tree = await Effect.runPromise(
        aggregateTopologyFromRegistries(
          { orgId: "nobody", mcpUiTraceBase: "/mcp-ui/trace" },
          { CLAWQL_HOME: home }
        )
      );
      expect(tree.empty).toBe(true);
      expect(tree.gateways).toEqual([]);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});
