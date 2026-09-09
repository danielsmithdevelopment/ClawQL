/**
 * Topology aggregation over real Gap A + Gap B registries + celld.
 * Spec: docs/specs/network/gateway-agent-registries-v0.1.md
 *
 * No heuristic Tailscale scrape. No compensation ledger stand-in.
 * Dashboard UI wires here only (step 4).
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Context, Effect, Layer } from "effect";
import {
  AgentInstanceRegistryService,
  agentInstanceRegistryLiveLayer,
  type AgentInstanceRecord,
} from "clawql-agents";
import {
  GatewayRegistryService,
  gatewayRegistryLiveLayer,
  type GatewayRecord,
} from "clawql-network";
import type { AgentNode, GatewayNode, GatewayStatus, TopologyTree } from "./topology-types.js";

const execFileAsync = promisify(execFile);

export type TopologyAgentNode = AgentNode;
export type TopologyGatewayNode = GatewayNode;
export type TopologyNodeStatus = GatewayStatus;
export type TopologyAgentKind = AgentNode["kind"];

export type { TopologyTree } from "./topology-types.js";

export type AggregateTopologyInput = {
  readonly orgId: string;
  readonly mcpUiTraceBase: string;
};

export class TopologyService extends Context.Tag("clawql-payments/TopologyService")<
  TopologyService,
  {
    readonly aggregate: (input: AggregateTopologyInput) => Effect.Effect<TopologyTree>;
  }
>() {}

/**
 * Compare demo URL (compressed vs fat). Do **not** append `?focus=<agentId>`:
 * `/mcp-ui/trace/compare` only honors `focus=input|all`; any other value is
 * silently coerced and serves the same generic demo (#1082). Prefer an honest
 * bare compare link until per-agent/session scoping exists.
 */
function mcpTraceCompareDemoLink(base: string): string {
  const root = base.replace(/\/$/, "");
  return root.endsWith("/trace") ? `${root}/compare` : `${root}/trace/compare`;
}

function mapGatewayStatus(s: GatewayRecord["status"]): GatewayStatus {
  return s;
}

function mapAgentStatus(s: AgentInstanceRecord["status"]): GatewayStatus {
  if (s === "active") return "healthy";
  if (s === "idle") return "degraded";
  return "offline";
}

type CellDraft = {
  agentId: string;
  cellStatus: "resident" | "hibernating";
  lastActive: string;
  status: GatewayStatus;
  parentHint?: string;
};

const loadCelldCells = (env: NodeJS.ProcessEnv): Effect.Effect<CellDraft[]> =>
  Effect.tryPromise({
    try: async () => {
      const bucket = env.CELLD_BUCKET?.trim();
      if (!bucket) return [];
      const args = ["cell", "list", "--bucket", bucket, "--json"];
      if (env.S3_ENDPOINT?.trim()) args.push("--endpoint", env.S3_ENDPOINT.trim());
      try {
        const { stdout } = await execFileAsync("celld", args, {
          timeout: 12_000,
          maxBuffer: 4 * 1024 * 1024,
          env: process.env,
        });
        const parsed = JSON.parse(stdout) as unknown;
        const rows = Array.isArray(parsed)
          ? parsed
          : Array.isArray((parsed as { cells?: unknown }).cells)
            ? (parsed as { cells: unknown[] }).cells
            : [];
        return rows.map((raw) => {
          const r = raw as Record<string, unknown>;
          const agentId = String(r.id ?? r.cellId ?? r.name ?? "cell-unknown");
          const hib =
            r.hibernating === true || r.status === "hibernating" || r.state === "hibernating";
          const lastActive = String(
            r.lastActive ?? r.last_active ?? r.updatedAt ?? new Date().toISOString()
          );
          return {
            agentId,
            cellStatus: hib ? ("hibernating" as const) : ("resident" as const),
            lastActive,
            status: hib ? ("degraded" as const) : ("healthy" as const),
            parentHint: typeof r.gatewayId === "string" ? r.gatewayId : undefined,
          };
        });
      } catch {
        return [];
      }
    },
    catch: () => [] as CellDraft[],
  }).pipe(Effect.catchAll(() => Effect.succeed([] as CellDraft[])));

export const aggregateTopologyFromRegistries = (
  input: AggregateTopologyInput,
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<TopologyTree> =>
  Effect.gen(function* () {
    const sources: string[] = [];
    const gateways = yield* Effect.gen(function* () {
      const reg = yield* GatewayRegistryService;
      return yield* reg.listMeshPeers(input.orgId);
    }).pipe(Effect.provide(gatewayRegistryLiveLayer(env.CLAWQL_HOME?.trim())));

    if (gateways.length) sources.push("gateway-registry");

    const agents = yield* Effect.gen(function* () {
      const reg = yield* AgentInstanceRegistryService;
      return yield* reg.listAgentInstances(input.orgId);
    }).pipe(Effect.provide(agentInstanceRegistryLiveLayer(env.CLAWQL_HOME?.trim())));

    if (agents.length) sources.push("agent-instance-registry");

    const cells = yield* loadCelldCells(env);
    if (cells.length) sources.push("celld-cell-list");

    if (!gateways.length) {
      return { gateways: [], sources, empty: true };
    }

    const byId = new Map(
      gateways.map((g) => [
        g.gatewayId,
        {
          gatewayId: g.gatewayId,
          kind: g.kind,
          meshIdentity: g.meshIdentity,
          ownerDeveloper: g.ownerDeveloper,
          lastSeen: g.lastSeen,
          status: mapGatewayStatus(g.status),
          children: [] as AgentNode[],
        } satisfies GatewayNode & { children: AgentNode[] },
      ])
    );
    const defaultParent =
      [...byId.values()].find((g) => g.kind === "regional" && g.status === "healthy") ??
      [...byId.values()].find((g) => g.kind === "regional") ??
      [...byId.values()][0]!;

    for (const a of agents) {
      const parent = byId.get(a.parentGatewayId) ?? defaultParent;
      parent.children.push({
        agentId: a.agentId,
        kind: "persistent",
        agentType: a.agentType,
        parentGatewayId: parent.gatewayId,
        lastActive: a.lastActive,
        traceLink: mcpTraceCompareDemoLink(input.mcpUiTraceBase),
        status: mapAgentStatus(a.status),
      });
    }

    for (const c of cells) {
      const parent = (c.parentHint && byId.get(c.parentHint)) || defaultParent;
      parent.children.push({
        agentId: c.agentId,
        kind: "cell",
        cellStatus: c.cellStatus,
        parentGatewayId: parent.gatewayId,
        lastActive: c.lastActive,
        traceLink: mcpTraceCompareDemoLink(input.mcpUiTraceBase),
        status: c.status,
      });
    }

    return {
      gateways: [...byId.values()],
      sources,
      empty: false,
    };
  });

export const topologyLiveLayer = (
  env: NodeJS.ProcessEnv = process.env
): Layer.Layer<TopologyService> =>
  Layer.succeed(TopologyService, {
    aggregate: (input) => aggregateTopologyFromRegistries(input, env),
  });

export const topologyFixedLayer = (tree: TopologyTree): Layer.Layer<TopologyService> =>
  Layer.succeed(TopologyService, {
    aggregate: () => Effect.succeed(tree),
  });

/** Alias used by earlier CPC snapshots — same as topologyFixedLayer. */
export const topologySnapshotLayer = topologyFixedLayer;
