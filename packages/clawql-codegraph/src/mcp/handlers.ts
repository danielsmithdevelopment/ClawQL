import { z } from "zod";
import { Effect } from "effect";
import { CodeGraphService, runCodeGraphEffect } from "../effect/codegraph-service.js";
import { syncCodeGraph } from "../sync/codegraph-sync.js";
import { syncGraphify } from "../sync/graphify-sync.js";

const indexInput = z.object({
  rootPath: z
    .string()
    .optional()
    .describe("Repository root to index (defaults to CLAWQL_CODEGRAPH_ROOT or cwd)."),
  graphId: z.string().optional().describe("Stable graph id (defaults from directory name)."),
  maxFiles: z.number().int().positive().optional().describe("Cap indexed source files."),
  storagePath: z.string().optional().describe("Optional JSON storage path override."),
});

const graphIdInput = z.object({
  graphId: z.string().min(1),
  storagePath: z.string().optional(),
});

const queryInput = graphIdInput.extend({
  query: z.string().min(1).describe("Symbol name, path fragment, or natural-language concept."),
  limit: z.number().int().positive().optional(),
});

const neighborsInput = graphIdInput.extend({
  nodeId: z.string().min(1).describe("Exact node id from codegraph_query results."),
  edgeKinds: z
    .array(z.enum(["imports", "exports", "contains", "calls", "extends", "implements", "references"]))
    .optional(),
  limit: z.number().int().positive().optional(),
});

const pathInput = graphIdInput.extend({
  from: z.string().min(1).describe("Start symbol or concept (resolved via query)."),
  to: z.string().min(1).describe("End symbol or concept (resolved via query)."),
});

const explainInput = graphIdInput.extend({
  nodeQuery: z.string().min(1).describe("Symbol or concept to explain."),
});

const subgraphInput = graphIdInput.extend({
  seedQuery: z.string().min(1),
  maxDepth: z.number().int().min(0).max(6).optional(),
  maxNodes: z.number().int().positive().optional(),
});

const importGraphifyInput = z.object({
  jsonPath: z.string().min(1).describe("Path to Graphify graph.json (NetworkX node-link export)."),
  graphId: z.string().optional(),
  rootPath: z.string().optional(),
  storagePath: z.string().optional(),
});

const syncInput = z.object({
  rootPath: z
    .string()
    .optional()
    .describe("Repository root (defaults to CLAWQL_CODEGRAPH_ROOT or cwd)."),
  graphId: z.string().optional(),
  storagePath: z.string().optional(),
  mode: z
    .enum(["fast", "thorough"])
    .optional()
    .describe("thorough raises the default maxFiles cap for larger repos."),
  outDir: z
    .string()
    .optional()
    .describe("Artifact directory for graph.json / GRAPH_REPORT.md / graph.html (default: {root}/codegraph-out)."),
  vaultIngest: z
    .boolean()
    .optional()
    .describe("Include vault ingest proposal (report + communities). Default true; MemoryPlugin applies it."),
  maxFiles: z.number().int().positive().optional(),
  writeHtml: z.boolean().optional().describe("Write interactive graph.html (default true)."),
});

const syncGraphifyInput = z.object({
  rootPath: z
    .string()
    .optional()
    .describe("Repository root (defaults to CLAWQL_CODEGRAPH_ROOT or cwd)."),
  graphId: z.string().optional(),
  storagePath: z.string().optional(),
  mode: z.enum(["fast", "thorough"]).optional(),
  skipGraphifyRun: z
    .boolean()
    .optional()
    .describe("Ignored (Python CLI is never spawned). Kept for back-compat."),
  outDir: z
    .string()
    .optional()
    .describe(
      "Directory with an existing graph.json to import. If missing, falls back to native codegraph_sync."
    ),
  vaultIngest: z.boolean().optional(),
  maxFiles: z.number().int().positive().optional(),
});

export async function codegraphIndex(raw: unknown) {
  const input = indexInput.parse(raw);
  const rootPath =
    input.rootPath?.trim() ||
    process.env.CLAWQL_CODEGRAPH_ROOT?.trim() ||
    process.cwd();
  return runCodeGraphEffect(
    Effect.gen(function* () {
      const svc = yield* CodeGraphService;
      return yield* svc.index({ ...input, rootPath });
    }),
    input.storagePath
  );
}

export async function codegraphQuery(raw: unknown) {
  const input = queryInput.parse(raw);
  return runCodeGraphEffect(
    Effect.gen(function* () {
      const svc = yield* CodeGraphService;
      return yield* svc.query(input.graphId, input.query, input.limit, input.storagePath);
    }),
    input.storagePath
  );
}

export async function codegraphNeighbors(raw: unknown) {
  const input = neighborsInput.parse(raw);
  return runCodeGraphEffect(
    Effect.gen(function* () {
      const svc = yield* CodeGraphService;
      return yield* svc.neighbors(input.graphId, input.nodeId, {
        edgeKinds: input.edgeKinds,
        limit: input.limit,
        storagePath: input.storagePath,
      });
    }),
    input.storagePath
  );
}

export async function codegraphPath(raw: unknown) {
  const input = pathInput.parse(raw);
  return runCodeGraphEffect(
    Effect.gen(function* () {
      const svc = yield* CodeGraphService;
      return yield* svc.path(input.graphId, input.from, input.to, input.storagePath);
    }),
    input.storagePath
  );
}

export async function codegraphExplain(raw: unknown) {
  const input = explainInput.parse(raw);
  return runCodeGraphEffect(
    Effect.gen(function* () {
      const svc = yield* CodeGraphService;
      return yield* svc.explain(input.graphId, input.nodeQuery, input.storagePath);
    }),
    input.storagePath
  );
}

export async function codegraphSubgraph(raw: unknown) {
  const input = subgraphInput.parse(raw);
  return runCodeGraphEffect(
    Effect.gen(function* () {
      const svc = yield* CodeGraphService;
      return yield* svc.subgraph(
        input.graphId,
        input.seedQuery,
        input.maxDepth,
        input.maxNodes,
        input.storagePath
      );
    }),
    input.storagePath
  );
}

export async function codegraphImportGraphify(raw: unknown) {
  const input = importGraphifyInput.parse(raw);
  return runCodeGraphEffect(
    Effect.gen(function* () {
      const svc = yield* CodeGraphService;
      return yield* svc.importGraphify(input);
    }),
    input.storagePath
  );
}

/** Native TypeScript index → Louvain → report/HTML → vault proposal. No Python. */
export async function codegraphSync(raw: unknown) {
  const input = syncInput.parse(raw);
  return syncCodeGraph(input);
}

/**
 * Optional import of an existing graph.json (Graphify or prior export).
 * Never spawns Python; falls back to {@link codegraphSync} when no graph.json exists.
 */
export async function codegraphSyncGraphify(raw: unknown) {
  const input = syncGraphifyInput.parse(raw);
  return syncGraphify(input);
}

export type CodeGraphMcpHandlers = {
  index: typeof codegraphIndex;
  query: typeof codegraphQuery;
  neighbors: typeof codegraphNeighbors;
  path: typeof codegraphPath;
  explain: typeof codegraphExplain;
  subgraph: typeof codegraphSubgraph;
  importGraphify: typeof codegraphImportGraphify;
  sync: typeof codegraphSync;
  syncGraphify: typeof codegraphSyncGraphify;
};

export function createCodeGraphMcpHandlers(): CodeGraphMcpHandlers {
  return {
    index: codegraphIndex,
    query: codegraphQuery,
    neighbors: codegraphNeighbors,
    path: codegraphPath,
    explain: codegraphExplain,
    subgraph: codegraphSubgraph,
    importGraphify: codegraphImportGraphify,
    sync: codegraphSync,
    syncGraphify: codegraphSyncGraphify,
  };
}
