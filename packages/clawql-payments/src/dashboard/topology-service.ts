/**
 * Topology aggregation — thin read view over mesh / ManagedGateway /
 * compensation ledger / celld. No new backend product.
 */

import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { Context, Effect, Layer } from "effect";
import type { AgentAccount } from "../compensation/accounts.js";
import type {
  AgentNode,
  CellStatus,
  GatewayKind,
  GatewayNode,
  GatewayStatus,
  PersistentAgentType,
  TopologySnapshotFile,
  TopologyTree,
} from "./topology-types.js";

const execFileAsync = promisify(execFile);

export type AggregateTopologyInput = {
  readonly orgId: string;
  readonly actorTenantId: string;
  readonly mcpUiTraceBase: string;
  readonly agents: readonly AgentAccount[];
};

export class TopologyService extends Context.Tag("clawql-payments/TopologyService")<
  TopologyService,
  {
    readonly aggregate: (input: AggregateTopologyInput) => Effect.Effect<TopologyTree>;
  }
>() {}

function resolveHome(env: NodeJS.ProcessEnv): string {
  const h = env.CLAWQL_HOME?.trim();
  if (h) return h;
  return join(homedir(), ".clawql");
}

function mcpTraceCompareLink(base: string, agentId: string): string {
  const root = base.replace(/\/$/, "");
  const compare = root.endsWith("/trace") ? `${root}/compare` : `${root}/trace/compare`;
  return `${compare}?focus=${encodeURIComponent(agentId)}`;
}

function statusFromSeen(
  online: boolean | undefined,
  lastSeenIso: string | undefined
): GatewayStatus {
  if (online === true) return "healthy";
  if (!lastSeenIso) return online === false ? "offline" : "degraded";
  const ageMs = Date.now() - Date.parse(lastSeenIso);
  if (!Number.isFinite(ageMs)) return "offline";
  if (ageMs <= 5 * 60_000) return "degraded";
  return "offline";
}

function inferAgentType(agentId: string): PersistentAgentType | undefined {
  const id = agentId.toLowerCase();
  if (id.includes("hermes")) return "hermes";
  if (id.includes("cline")) return "cline";
  if (id.includes("openclaw")) return "openclaw";
  if (/(^|[-_:./])pi([-_:./]|$)/.test(id) || id.startsWith("pi")) return "pi";
  return undefined;
}

function classifyGatewayKind(hostname: string, tags: readonly string[]): GatewayKind {
  const t = tags.map((x) => x.toLowerCase());
  if (t.some((x) => x.includes("edge") || x.includes("devmachine") || x.includes("laptop"))) {
    return "edge";
  }
  if (t.some((x) => x.includes("regional") || x.includes("region") || x.includes("cloud"))) {
    return "regional";
  }
  // Heuristic: user@host or Mac-/Windows-style personal machines → edge
  if (hostname.includes("@") || /mac-?mini|macbook|desktop|laptop|workstation/i.test(hostname)) {
    return "edge";
  }
  return "regional";
}

function ownerFromHostname(hostname: string, kind: GatewayKind): string | undefined {
  if (kind !== "edge") return undefined;
  const at = hostname.indexOf("@");
  if (at > 0) return hostname.slice(0, at);
  return undefined;
}

type MeshPeerDraft = {
  gatewayId: string;
  kind: GatewayKind;
  meshIdentity: string;
  ownerDeveloper?: string;
  lastSeen: string;
  status: GatewayStatus;
};

async function readJsonFile<T>(path: string): Promise<T | null> {
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function tryExec(cmd: string, args: string[], timeoutMs = 8_000): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(cmd, args, {
      timeout: timeoutMs,
      maxBuffer: 4 * 1024 * 1024,
      env: process.env,
    });
    return typeof stdout === "string" ? stdout : String(stdout);
  } catch {
    return null;
  }
}

async function loadSnapshot(env: NodeJS.ProcessEnv): Promise<TopologyTree | null> {
  const path = env.CLAWQL_TOPOLOGY_SNAPSHOT?.trim();
  if (!path) return null;
  const file = await readJsonFile<TopologySnapshotFile>(path);
  if (!file?.gateways) return null;
  return {
    gateways: file.gateways,
    sources: file.sources ?? ["snapshot"],
    empty: file.gateways.length === 0,
  };
}

async function loadTailscalePeers(): Promise<{ peers: MeshPeerDraft[]; source?: string }> {
  const out = await tryExec("tailscale", ["status", "--json"]);
  if (!out) return { peers: [] };
  try {
    const parsed = JSON.parse(out) as {
      Self?: {
        ID?: string;
        HostName?: string;
        DNSName?: string;
        Online?: boolean;
        LastSeen?: string;
        Tags?: string[];
      };
      Peer?: Record<
        string,
        {
          ID?: string;
          HostName?: string;
          DNSName?: string;
          Online?: boolean;
          LastSeen?: string;
          Tags?: string[] | null;
        }
      >;
    };
    const peers: MeshPeerDraft[] = [];
    const push = (n: {
      ID?: string;
      HostName?: string;
      DNSName?: string;
      Online?: boolean;
      LastSeen?: string;
      Tags?: string[] | null;
    }) => {
      const hostname =
        (n.DNSName?.replace(/\.$/, "") || n.HostName || n.ID || "").trim() || "unknown";
      const gatewayId = (n.ID || hostname).trim();
      if (!gatewayId) return;
      const tags = Array.isArray(n.Tags) ? n.Tags : [];
      const kind = classifyGatewayKind(hostname, tags);
      const lastSeen =
        typeof n.LastSeen === "string" && n.LastSeen ? n.LastSeen : new Date().toISOString();
      peers.push({
        gatewayId,
        kind,
        meshIdentity: hostname,
        ownerDeveloper: ownerFromHostname(hostname, kind),
        lastSeen,
        status: statusFromSeen(n.Online, n.LastSeen),
      });
    };
    if (parsed.Self) push(parsed.Self);
    for (const p of Object.values(parsed.Peer ?? {})) push(p);
    return { peers, source: "tailscale-status" };
  } catch {
    return { peers: [] };
  }
}

async function loadHeadscalePeers(): Promise<{ peers: MeshPeerDraft[]; source?: string }> {
  const out =
    (await tryExec("headscale", ["nodes", "list", "--output", "json"])) ??
    (await tryExec("headscale", ["nodes", "list", "-o", "json"]));
  if (!out) return { peers: [] };
  try {
    const list = JSON.parse(out) as Array<{
      id?: string | number;
      name?: string;
      given_name?: string;
      givenName?: string;
      online?: boolean;
      last_seen?: string;
      lastSeen?: string;
      forced_tags?: string[];
      valid_tags?: string[];
    }>;
    if (!Array.isArray(list)) return { peers: [] };
    const peers: MeshPeerDraft[] = list.map((n) => {
      const hostname = String(n.givenName ?? n.given_name ?? n.name ?? n.id ?? "node");
      const gatewayId = String(n.id ?? hostname);
      const tags = [...(n.forced_tags ?? []), ...(n.valid_tags ?? [])];
      const kind = classifyGatewayKind(hostname, tags);
      const lastSeen = n.lastSeen ?? n.last_seen ?? new Date().toISOString();
      return {
        gatewayId,
        kind,
        meshIdentity: hostname,
        ownerDeveloper: ownerFromHostname(hostname, kind),
        lastSeen,
        status: statusFromSeen(n.online, lastSeen),
      };
    });
    return { peers, source: "headscale-nodes" };
  } catch {
    return { peers: [] };
  }
}

async function loadNetworkStateGateway(
  home: string
): Promise<{ peer: MeshPeerDraft | null; source?: string }> {
  const state = await readJsonFile<{
    meshIdentity?: { nodeId?: string; meshAddress?: string };
    derpRelay?: { region?: string };
    initializedAt?: string;
  }>(join(home, "network", "network.json"));
  if (!state?.meshIdentity?.nodeId && !state?.meshIdentity?.meshAddress) {
    return { peer: null };
  }
  const meshIdentity =
    state.meshIdentity.meshAddress ||
    state.meshIdentity.nodeId ||
    state.derpRelay?.region ||
    "mesh-local";
  const gatewayId = state.meshIdentity.nodeId || meshIdentity;
  const lastSeen = state.initializedAt ?? new Date().toISOString();
  const kind = classifyGatewayKind(meshIdentity, state.derpRelay?.region ? ["regional"] : []);
  return {
    peer: {
      gatewayId,
      kind,
      meshIdentity,
      ownerDeveloper: ownerFromHostname(meshIdentity, kind),
      lastSeen,
      status: statusFromSeen(true, lastSeen),
    },
    source: "network-state",
  };
}

async function loadManagedGateway(
  home: string
): Promise<{ peer: MeshPeerDraft | null; source?: string }> {
  const state = await readJsonFile<{
    version?: number;
    team?: string;
    createdAt?: string;
    urls?: { gateway?: string; healthz?: string };
    pids?: Record<string, number | undefined>;
  }>(join(home, "ManagedGateway", "gateway.json"));
  if (!state?.urls?.gateway && !state?.team) return { peer: null };

  let status: GatewayStatus = "degraded";
  const healthz = state.urls?.healthz?.trim();
  if (healthz) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 1_200);
      const res = await fetch(healthz, { signal: ctrl.signal });
      clearTimeout(t);
      status = res.ok ? "healthy" : "degraded";
    } catch {
      status = state.pids && Object.values(state.pids).some(Boolean) ? "degraded" : "offline";
    }
  } else if (state.pids && Object.values(state.pids).some(Boolean)) {
    status = "healthy";
  }

  const meshIdentity =
    state.urls?.gateway?.replace(/^https?:\/\//, "").replace(/\/$/, "") ||
    `managed:${state.team ?? "gateway"}`;
  return {
    peer: {
      gatewayId: `managed-${state.team ?? "gateway"}`,
      kind: "regional",
      meshIdentity,
      lastSeen: state.createdAt ?? new Date().toISOString(),
      status,
    },
    source: "managed-gateway",
  };
}

type CellDraft = {
  agentId: string;
  cellStatus: CellStatus;
  lastActive: string;
  status: GatewayStatus;
  parentHint?: string;
};

async function loadCelldCells(env: NodeJS.ProcessEnv): Promise<{
  cells: CellDraft[];
  source?: string;
}> {
  const bucket = env.CELLD_BUCKET?.trim();
  if (!bucket) return { cells: [] };
  const args = ["cell", "list", "--bucket", bucket, "--json"];
  if (env.S3_ENDPOINT?.trim()) {
    args.push("--endpoint", env.S3_ENDPOINT.trim());
  }
  const out = await tryExec("celld", args, 12_000);
  if (!out) return { cells: [] };
  try {
    const parsed = JSON.parse(out) as unknown;
    const rows = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as { cells?: unknown }).cells)
        ? (parsed as { cells: unknown[] }).cells
        : [];
    const cells: CellDraft[] = rows.map((raw) => {
      const r = raw as Record<string, unknown>;
      const agentId = String(r.id ?? r.cellId ?? r.name ?? "cell-unknown");
      const hib =
        r.hibernating === true ||
        r.status === "hibernating" ||
        r.state === "hibernating" ||
        r.cellStatus === "hibernating";
      const cellStatus: CellStatus = hib ? "hibernating" : "resident";
      const lastActive = String(
        r.lastActive ?? r.last_active ?? r.updatedAt ?? r.updated_at ?? new Date().toISOString()
      );
      const online = r.online === true || (!hib && r.online !== false);
      return {
        agentId,
        cellStatus,
        lastActive,
        status: hib ? "degraded" : statusFromSeen(online, lastActive),
        parentHint: typeof r.gatewayId === "string" ? r.gatewayId : undefined,
      };
    });
    return { cells, source: "celld-cell-list" };
  } catch {
    return { cells: [] };
  }
}

function persistentFromAccounts(
  agents: readonly AgentAccount[],
  parentGatewayId: string,
  mcpUiTraceBase: string
): AgentNode[] {
  return agents.map((a) => {
    const age = Date.parse(a.updatedAt);
    const online = Number.isFinite(age) && Date.now() - age < 15 * 60_000;
    const funded = a.fundsUsd > 0 || a.creditsUsd > 0;
    const status: GatewayStatus = online ? "healthy" : funded ? "degraded" : "offline";
    return {
      agentId: a.agentId,
      kind: "persistent" as const,
      agentType: inferAgentType(a.agentId),
      parentGatewayId,
      lastActive: a.updatedAt,
      traceLink: mcpTraceCompareLink(mcpUiTraceBase, a.agentId),
      status,
    };
  });
}

function attachChildren(
  drafts: MeshPeerDraft[],
  persistent: AgentNode[],
  cells: CellDraft[],
  mcpUiTraceBase: string
): GatewayNode[] {
  if (!drafts.length) return [];

  const byId = new Map(drafts.map((d) => [d.gatewayId, { ...d, children: [] as AgentNode[] }]));
  const ordered = [...byId.values()];
  const defaultParent =
    ordered.find((g) => g.kind === "regional" && g.status === "healthy") ??
    ordered.find((g) => g.kind === "regional") ??
    ordered[0]!;

  for (const p of persistent) {
    const parent = byId.get(p.parentGatewayId) ?? defaultParent;
    parent.children.push({ ...p, parentGatewayId: parent.gatewayId });
  }

  for (const c of cells) {
    const parent = (c.parentHint && byId.get(c.parentHint)) || defaultParent;
    parent.children.push({
      agentId: c.agentId,
      kind: "cell",
      cellStatus: c.cellStatus,
      parentGatewayId: parent.gatewayId,
      lastActive: c.lastActive,
      traceLink: mcpTraceCompareLink(mcpUiTraceBase, c.agentId),
      status: c.status,
    });
  }

  return ordered.map((g) => ({
    gatewayId: g.gatewayId,
    kind: g.kind,
    meshIdentity: g.meshIdentity,
    ownerDeveloper: g.ownerDeveloper,
    lastSeen: g.lastSeen,
    status: g.status,
    children: g.children,
  }));
}

export const aggregateTopologyEffect = (
  input: AggregateTopologyInput,
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<TopologyTree> =>
  Effect.gen(function* () {
    const snap = yield* Effect.tryPromise({
      try: () => loadSnapshot(env),
      catch: () => null,
    }).pipe(Effect.catchAll(() => Effect.succeed(null)));
    if (snap) return snap;

    const home = resolveHome(env);
    const sources: string[] = [];

    const emptyPeers: { peers: MeshPeerDraft[]; source?: string } = { peers: [] };
    const emptyPeer: { peer: MeshPeerDraft | null; source?: string } = { peer: null };
    const emptyCells: { cells: CellDraft[]; source?: string } = { cells: [] };

    const ts = yield* Effect.tryPromise({
      try: () => loadTailscalePeers(),
      catch: () => emptyPeers,
    }).pipe(Effect.catchAll(() => Effect.succeed(emptyPeers)));
    if (ts.source) sources.push(ts.source);

    let drafts = ts.peers;
    if (!drafts.length) {
      const hs = yield* Effect.tryPromise({
        try: () => loadHeadscalePeers(),
        catch: () => emptyPeers,
      }).pipe(Effect.catchAll(() => Effect.succeed(emptyPeers)));
      if (hs.source) sources.push(hs.source);
      drafts = hs.peers;
    }
    if (!drafts.length) {
      const ns = yield* Effect.tryPromise({
        try: () => loadNetworkStateGateway(home),
        catch: () => emptyPeer,
      }).pipe(Effect.catchAll(() => Effect.succeed(emptyPeer)));
      if (ns.peer) {
        drafts = [ns.peer];
        if (ns.source) sources.push(ns.source);
      }
    }
    if (!drafts.length) {
      const mg = yield* Effect.tryPromise({
        try: () => loadManagedGateway(home),
        catch: () => emptyPeer,
      }).pipe(Effect.catchAll(() => Effect.succeed(emptyPeer)));
      if (mg.peer) {
        drafts = [mg.peer];
        if (mg.source) sources.push(mg.source);
      }
    }

    const cellLoad = yield* Effect.tryPromise({
      try: () => loadCelldCells(env),
      catch: () => emptyCells,
    }).pipe(Effect.catchAll(() => Effect.succeed(emptyCells)));
    if (cellLoad.source) sources.push(cellLoad.source);

    // Agents without any gateway → still empty topology (prompt to connect gateway).
    // Do not invent a fake healthy host.
    if (!drafts.length) {
      return { gateways: [], sources, empty: true };
    }

    if (input.agents.length) sources.push("compensation-accounts");

    const defaultParentId = drafts[0]!.gatewayId;
    const persistent = persistentFromAccounts(input.agents, defaultParentId, input.mcpUiTraceBase);

    const gateways = attachChildren(drafts, persistent, cellLoad.cells, input.mcpUiTraceBase);
    return {
      gateways,
      sources,
      empty: gateways.length === 0,
    };
  });

export const topologyLiveLayer = (
  env: NodeJS.ProcessEnv = process.env
): Layer.Layer<TopologyService> =>
  Layer.succeed(TopologyService, {
    aggregate: (input) => aggregateTopologyEffect(input, env),
  });

/** Test helper: fixed tree without subprocess IO. */
export const topologySnapshotLayer = (tree: TopologyTree): Layer.Layer<TopologyService> =>
  Layer.succeed(TopologyService, {
    aggregate: () => Effect.succeed(tree),
  });
