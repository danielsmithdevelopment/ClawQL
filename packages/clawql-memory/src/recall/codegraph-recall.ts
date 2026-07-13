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

/** Whether structural code graph MCP tools are registered (opt-in). */
export function codeGraphEnabled(): boolean {
  const v = process.env.CLAWQL_ENABLE_CODEGRAPH?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function defaultCodeGraphRoot(): string {
  const v = process.env.CLAWQL_CODEGRAPH_ROOT?.trim();
  return v || process.cwd();
}

/** Merge vault recall with code graph symbol hits when enabled. */
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

/** Query the code graph for symbols matching a vault recall query. */
export async function recallCodeGraphSupplement(input: {
  query: string;
  graphId?: string;
  limit?: number;
}): Promise<CodeGraphRecallHit[]> {
  if (!hybridCodeGraphRecallEnabled()) return [];
  const graphId = input.graphId ?? defaultCodeGraphId();
  const doc = await loadGraphDocument(graphId);
  if (!doc) return [];
  const limit = input.limit ?? envInt("CLAWQL_MEMORY_RECALL_CODEGRAPH_LIMIT", 8);
  const hits: CodeGraphQueryHit[] = queryGraph(doc, input.query, limit);
  return hits.map((h) => ({
    nodeId: h.nodeId,
    name: h.name,
    kind: h.kind,
    filePath: h.filePath,
    score: h.score,
    snippet: h.snippet,
  }));
}

function envInt(key: string, def: number): number {
  const v = process.env[key]?.trim();
  if (!v) return def;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}
