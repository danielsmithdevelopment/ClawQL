import {
  codeGraphBackend,
  defaultCodeGraphId,
  defaultCodeGraphStoragePath,
  FileCodeGraphStorage,
  graphifyJsonPath,
  loadGraphifyDocument,
  queryGraph,
  type CodeGraphQueryHit,
} from "clawql-codegraph";
import type { NormalizedRecallHit, RecallFollowUpHint } from "./recall-sources.js";

/** Whether structural code graph MCP tools are registered (opt-in). */
export function codeGraphEnabled(): boolean {
  const v = process.env.CLAWQL_ENABLE_CODEGRAPH?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function defaultCodeGraphRoot(): string {
  const v = process.env.CLAWQL_CODEGRAPH_ROOT?.trim();
  return v || process.cwd();
}

/** Merge vault recall with code graph symbol hits when enabled via env. */
export function hybridCodeGraphRecallEnabled(): boolean {
  if (!codeGraphEnabled()) return false;
  const v = process.env.CLAWQL_MEMORY_RECALL_HYBRID_CODEGRAPH?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export type CodeGraphRecallHit = {
  nodeId: string;
  name: string;
  kind: string;
  filePath?: string;
  score: number;
  snippet?: string;
};

function storagePath(): string {
  const base = process.env.CLAWQL_CODEGRAPH_PATH?.trim();
  return base ? defaultCodeGraphStoragePath(base) : "./data/codegraph.db.json";
}

async function loadGraphDocument(graphId: string) {
  if (codeGraphBackend() === "graphify" && graphifyJsonPath()) {
    return loadGraphifyDocument({ graphId, jsonPath: graphifyJsonPath() });
  }
  const store = new FileCodeGraphStorage(storagePath());
  return store.get(graphId);
}

export type CodeGraphRecallSupplement = {
  codeGraphHits: CodeGraphRecallHit[];
  hits: NormalizedRecallHit[];
  followUps: RecallFollowUpHint[];
  skipped?: string;
};

/**
 * Query the code graph for symbols matching a vault recall query.
 * @param force when true (e.g. sources includes codegraph), skip hybrid env gate.
 */
export async function recallCodeGraphSupplement(input: {
  query: string;
  graphId?: string;
  limit?: number;
  force?: boolean;
}): Promise<CodeGraphRecallHit[]> {
  const pack = await recallCodeGraphSupplementPack(input);
  return pack.codeGraphHits;
}

export async function recallCodeGraphSupplementPack(input: {
  query: string;
  graphId?: string;
  limit?: number;
  force?: boolean;
}): Promise<CodeGraphRecallSupplement> {
  const graphId = input.graphId ?? defaultCodeGraphId();
  const followUps: RecallFollowUpHint[] = [
    {
      tool: "codegraph_query",
      reason: "Query the structural code graph with richer limit / graphId options.",
      args: { graphId, query: input.query },
    },
  ];

  if (!codeGraphEnabled()) {
    return {
      codeGraphHits: [],
      hits: [],
      followUps: [
        {
          tool: "codegraph_index",
          reason: "Enable CLAWQL_ENABLE_CODEGRAPH=1 and index a repo first.",
          args: {},
        },
      ],
      skipped: "Code graph tools are not enabled",
    };
  }

  if (!input.force && !hybridCodeGraphRecallEnabled()) {
    return {
      codeGraphHits: [],
      hits: [],
      followUps,
      skipped: "Hybrid codegraph not enabled (set CLAWQL_MEMORY_RECALL_HYBRID_CODEGRAPH=1 or pass sources: [\"codegraph\"])",
    };
  }

  const doc = await loadGraphDocument(graphId);
  if (!doc) {
    return {
      codeGraphHits: [],
      hits: [],
      followUps: [
        {
          tool: "codegraph_index",
          reason: `No code graph found for id ${graphId}; run codegraph_index (or import Graphify).`,
          args: { graphId },
        },
      ],
      skipped: `Code graph not found: ${graphId}`,
    };
  }

  const limit = input.limit ?? envInt("CLAWQL_MEMORY_RECALL_CODEGRAPH_LIMIT", 8);
  const raw: CodeGraphQueryHit[] = queryGraph(doc, input.query, limit);
  const codeGraphHits: CodeGraphRecallHit[] = raw.map((h) => ({
    nodeId: h.nodeId,
    name: h.name,
    kind: h.kind,
    filePath: h.filePath,
    score: h.score,
    snippet: h.snippet,
  }));

  const hits: NormalizedRecallHit[] = codeGraphHits.map((h) => ({
    source: "codegraph",
    id: h.nodeId,
    score: h.score,
    snippet: h.snippet ?? `${h.kind} ${h.name}`,
    path: h.filePath,
    title: h.name,
    meta: { kind: h.kind, nodeId: h.nodeId, graphId },
  }));

  if (codeGraphHits.length >= 2) {
    followUps.push({
      tool: "codegraph_path",
      reason: "Trace shortest path between top matching symbols.",
      args: {
        graphId,
        from: codeGraphHits[0]!.name,
        to: codeGraphHits[1]!.name,
      },
    });
  }
  if (codeGraphHits.length >= 1) {
    followUps.push({
      tool: "codegraph_neighbors",
      reason: "List imports/calls around the top symbol.",
      args: { graphId, nodeId: codeGraphHits[0]!.nodeId },
    });
  }

  return { codeGraphHits, hits, followUps };
}

function envInt(key: string, def: number): number {
  const v = process.env[key]?.trim();
  if (!v) return def;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}
