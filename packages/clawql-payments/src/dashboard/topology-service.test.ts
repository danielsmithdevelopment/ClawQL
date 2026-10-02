import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GatewayRegistryService, gatewayRegistryLiveLayer } from "clawql-network";
import { AgentInstanceRegistryService, agentInstanceRegistryLiveLayer } from "clawql-agents";
import {
  aggregateTopologyFromRegistries,
  mcpAgentTraceLink,
  parseCelldListJson,
} from "./topology-service.js";

describe("mcpAgentTraceLink", () => {
  it("builds distinct per-agent /trace/agent/ URLs (no focus=, no bare compare)", () => {
    expect(mcpAgentTraceLink("/mcp-ui/trace", "hermes-042")).toBe("/mcp-ui/trace/agent/hermes-042");
    expect(mcpAgentTraceLink("/mcp-ui/trace", "cline-017")).toBe("/mcp-ui/trace/agent/cline-017");
    expect(mcpAgentTraceLink("/mcp-ui/trace", "hermes-042")).not.toBe(
      mcpAgentTraceLink("/mcp-ui/trace", "cline-017")
    );
    expect(mcpAgentTraceLink("/mcp-ui/trace", "a")).not.toMatch(/focus=/);
    expect(mcpAgentTraceLink("/mcp-ui/trace", "a")).not.toMatch(/\/compare$/);
  });
});

describe("parseCelldListJson", () => {
  it("maps celld list rows into CellDrafts", () => {
    const cells = parseCelldListJson(
      JSON.stringify({
        cells: [
          {
            id: "a8f2",
            hibernating: true,
            lastActive: "2026-09-01T00:00:00.000Z",
            gatewayId: "gw-east",
          },
          { cellId: "91bc", status: "resident", updatedAt: "2026-09-02T00:00:00.000Z" },
        ],
      })
    );
    expect(cells).toHaveLength(2);
    expect(cells[0]).toMatchObject({
      agentId: "a8f2",
      cellStatus: "hibernating",
      status: "degraded",
      parentHint: "gw-east",
    });
    expect(cells[1]).toMatchObject({
      agentId: "91bc",
      cellStatus: "resident",
      status: "healthy",
    });
  });
});

describe("aggregateTopologyFromRegistries", () => {
  it("builds tree from Gap A + Gap B with per-agent trace links", async () => {
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
          yield* agents.registerAgentInstance({
            agentId: "cline-017",
            agentType: "cline",
            parentGatewayId: "gw-east",
            orgId: "acme",
            lastCorrelationId: "sess-cline-017",
          });
        }).pipe(Effect.provide(agentInstanceRegistryLiveLayer(home)))
      );

      const tree = await Effect.runPromise(
        aggregateTopologyFromRegistries({ orgId: "acme", mcpUiTraceBase: "/mcp-ui/trace" }, env)
      );
      expect(tree.empty).toBe(false);
      expect(tree.sources).toContain("gateway-registry");
      expect(tree.sources).toContain("agent-instance-registry");
      expect(tree.sources).not.toContain("compensation-accounts");
      const kids = tree.gateways[0]!.children;
      const hermes = kids.find((c) => c.agentId === "hermes-042")!;
      const cline = kids.find((c) => c.agentId === "cline-017")!;
      expect(hermes.traceLink).toBe("/mcp-ui/trace/agent/hermes-042");
      expect(cline.traceLink).toBe("/mcp-ui/trace/agent/sess-cline-017");
      expect(hermes.traceLink).not.toBe(cline.traceLink);
      expect(hermes.traceLink).not.toMatch(/focus=/);
      expect(hermes.traceLink).not.toMatch(/\/compare$/);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  it("attaches celld cells from CELLD_LIST_JSON fixture", async () => {
    const home = await mkdtemp(join(tmpdir(), "clawql-topo-celld-"));
    const fixturePath = join(home, "cells.json");
    await writeFile(
      fixturePath,
      JSON.stringify([
        {
          id: "a8f2",
          hibernating: true,
          lastActive: "2026-09-01T00:00:00.000Z",
          gatewayId: "gw-east",
        },
      ]),
      "utf8"
    );
    const env = {
      CLAWQL_HOME: home,
      CELLD_LIST_JSON: `@${fixturePath}`,
    } as NodeJS.ProcessEnv;
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

      const tree = await Effect.runPromise(
        aggregateTopologyFromRegistries({ orgId: "acme", mcpUiTraceBase: "/mcp-ui/trace" }, env)
      );
      expect(tree.sources).toContain("celld-cell-list");
      expect(tree.sources).not.toContain("celld-unavailable");
      const cell = tree.gateways[0]!.children.find((c) => c.kind === "cell");
      expect(cell).toMatchObject({
        agentId: "a8f2",
        cellStatus: "hibernating",
        traceLink: "/mcp-ui/trace/agent/a8f2",
      });
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  it("marks celld-unavailable when CELLD_BUCKET set but list fails", async () => {
    const home = await mkdtemp(join(tmpdir(), "clawql-topo-celld-miss-"));
    const env = {
      CLAWQL_HOME: home,
      CELLD_BUCKET: "s3://missing-bucket-that-will-fail",
      // Force CLI path (no fixture). celld binary may be missing → unavailable.
      PATH: "/nonexistent",
    } as NodeJS.ProcessEnv;
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

      const tree = await Effect.runPromise(
        aggregateTopologyFromRegistries({ orgId: "acme", mcpUiTraceBase: "/mcp-ui/trace" }, env)
      );
      expect(tree.sources).toContain("celld-unavailable");
      expect(tree.sources).not.toContain("celld-cell-list");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  it("empty when no gateways registered (new org / zero gateways)", async () => {
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
      expect(tree.sources).not.toContain("compensation-accounts");
      expect(tree.sources).not.toContain("tailscale-status");
      expect(tree.sources).not.toContain("headscale-nodes");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});
