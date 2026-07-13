import { z } from "zod";
import { Effect } from "effect";
import { CodeGraphService, runCodeGraphEffect } from "../effect/codegraph-service.js";

const indexInput = z.object({
  rootPath: z.string().min(1).describe("Repository root to index (absolute or relative path)."),
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

export async function codegraphIndex(raw: unknown) {
  const input = indexInput.parse(raw);
  return runCodeGraphEffect(
    Effect.gen(function* () {
      const svc = yield* CodeGraphService;
      return yield* svc.index(input);
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

export type CodeGraphMcpHandlers = {
  index: typeof codegraphIndex;
  query: typeof codegraphQuery;
  neighbors: typeof codegraphNeighbors;
  path: typeof codegraphPath;
  explain: typeof codegraphExplain;
  subgraph: typeof codegraphSubgraph;
};

export function createCodeGraphMcpHandlers(): CodeGraphMcpHandlers {
  return {
    index: codegraphIndex,
    query: codegraphQuery,
    neighbors: codegraphNeighbors,
    path: codegraphPath,
    explain: codegraphExplain,
    subgraph: codegraphSubgraph,
  };
}
