import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  aggregateTopologyEffect,
  TopologyService,
  topologySnapshotLayer,
} from "./topology-service.js";
import type { TopologyTree } from "./topology-types.js";

describe("TopologyService", () => {
  it("returns empty tree when no mesh / gateway sources", async () => {
    const home = await mkdtemp(join(tmpdir(), "clawql-topo-empty-"));
    try {
      const tree = await Effect.runPromise(
        aggregateTopologyEffect(
          {
            orgId: "acme",
            actorTenantId: "acme:owner",
            mcpUiTraceBase: "/mcp-ui/trace",
            agents: [],
          },
          { CLAWQL_HOME: home }
        )
      );
      expect(tree.empty).toBe(true);
      expect(tree.gateways).toEqual([]);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  it("loads CLAWQL_TOPOLOGY_SNAPSHOT override", async () => {
    const home = await mkdtemp(join(tmpdir(), "clawql-topo-snap-"));
    const snapPath = join(home, "topology.json");
    const snap: TopologyTree = {
      empty: false,
      sources: ["snapshot"],
      gateways: [
        {
          gatewayId: "gw-east",
          kind: "regional",
          meshIdentity: "us-east-1",
          lastSeen: new Date().toISOString(),
          status: "healthy",
          children: [
            {
              agentId: "hermes-agent-042",
              kind: "persistent",
              agentType: "hermes",
              parentGatewayId: "gw-east",
              lastActive: new Date().toISOString(),
              traceLink: "/mcp-ui/trace/compare?focus=hermes-agent-042",
              status: "healthy",
            },
            {
              agentId: "a8f2cell",
              kind: "cell",
              cellStatus: "hibernating",
              parentGatewayId: "gw-east",
              lastActive: new Date().toISOString(),
              traceLink: "/mcp-ui/trace/compare?focus=a8f2cell",
              status: "degraded",
            },
          ],
        },
        {
          gatewayId: "edge-1",
          kind: "edge",
          meshIdentity: "daniel@Mac-Mini",
          ownerDeveloper: "daniel",
          lastSeen: new Date().toISOString(),
          status: "healthy",
          children: [
            {
              agentId: "cline-agent-017",
              kind: "persistent",
              agentType: "cline",
              parentGatewayId: "edge-1",
              lastActive: new Date().toISOString(),
              traceLink: "/mcp-ui/trace/compare?focus=cline-agent-017",
              status: "healthy",
            },
          ],
        },
      ],
    };
    await writeFile(snapPath, `${JSON.stringify(snap)}\n`);
    try {
      const tree = await Effect.runPromise(
        aggregateTopologyEffect(
          {
            orgId: "acme",
            actorTenantId: "acme:owner",
            mcpUiTraceBase: "/mcp-ui/trace",
            agents: [],
          },
          { CLAWQL_HOME: home, CLAWQL_TOPOLOGY_SNAPSHOT: snapPath }
        )
      );
      expect(tree.empty).toBe(false);
      expect(tree.gateways).toHaveLength(2);
      expect(tree.gateways[0]!.children[0]!.traceLink).toContain("/mcp-ui/trace/compare");
      expect(tree.gateways[0]!.children.every((c) => c.status !== undefined)).toBe(true);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  it("attaches compensation agents under network-state gateway", async () => {
    const home = await mkdtemp(join(tmpdir(), "clawql-topo-net-"));
    await mkdir(join(home, "network"), { recursive: true });
    await writeFile(
      join(home, "network", "network.json"),
      JSON.stringify({
        version: 1,
        transportDefault: "headscale-mesh",
        meshIdentity: { nodeId: "n1", meshAddress: "us-east-1.clawql.local", namespace: "clawql" },
        initializedAt: new Date().toISOString(),
      })
    );
    try {
      const tree = await Effect.runPromise(
        aggregateTopologyEffect(
          {
            orgId: "acme",
            actorTenantId: "acme:owner",
            mcpUiTraceBase: "/mcp-ui/trace",
            agents: [
              {
                agentId: "hermes-042",
                creditsUsd: 1,
                fundsUsd: 0,
                updatedAt: new Date().toISOString(),
                tenantId: "acme:owner",
              },
            ],
          },
          { CLAWQL_HOME: home }
        )
      );
      expect(tree.empty).toBe(false);
      expect(tree.sources).toContain("network-state");
      expect(tree.sources).toContain("compensation-accounts");
      expect(tree.gateways[0]!.children.some((c) => c.agentId === "hermes-042")).toBe(true);
      expect(tree.gateways[0]!.children[0]!.agentType).toBe("hermes");
      expect(tree.gateways[0]!.children[0]!.traceLink).toContain("compare?focus=");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  it("topologySnapshotLayer supplies fixed tree", async () => {
    const fixed: TopologyTree = {
      empty: true,
      gateways: [],
      sources: ["test"],
    };
    const tree = await Effect.runPromise(
      Effect.gen(function* () {
        const svc = yield* TopologyService;
        return yield* svc.aggregate({
          orgId: "x",
          actorTenantId: "x",
          mcpUiTraceBase: "/mcp-ui/trace",
          agents: [],
        });
      }).pipe(Effect.provide(topologySnapshotLayer(fixed)))
    );
    expect(tree).toEqual(fixed);
  });
});
