import { Context, Effect, Layer } from "effect";
import { exploreGraph, impactAnalysis } from "../graph/explore.js";
import { explainNode, getNeighbors, queryGraph, shortestPath, subgraph } from "../graph/operations.js";
import {
  documentSummary,
  importGraphifyFromPath,
  indexRepository,
  type IndexRepoOptions,
} from "../indexer/index-repo.js";
import { graphifyMcpDelegateEnabled, graphifyMcpQuery } from "../bridge/graphify-delegate.js";
import { storageFromPath, type CodeGraphStorage } from "../storage/file-storage.js";
import type { CodeGraphDocument } from "../types.js";

export class CodeGraphError extends Error {
  readonly _tag = "CodeGraphError";
  constructor(message: string) {
    super(message);
    this.name = "CodeGraphError";
  }
}

export class CodeGraphService extends Context.Tag("clawql/CodeGraphService")<
  CodeGraphService,
  {
    readonly index: (
      options: IndexRepoOptions & { storagePath?: string }
    ) => Effect.Effect<{ summary: ReturnType<typeof documentSummary> }, CodeGraphError>;
    readonly query: (
      graphId: string,
      query: string,
      limit?: number,
      storagePath?: string
    ) => Effect.Effect<ReturnType<typeof queryGraph>, CodeGraphError>;
    readonly neighbors: (
      graphId: string,
      nodeId: string,
      options?: { edgeKinds?: string[]; limit?: number; storagePath?: string }
    ) => Effect.Effect<ReturnType<typeof getNeighbors>, CodeGraphError>;
    readonly path: (
      graphId: string,
      from: string,
      to: string,
      storagePath?: string
    ) => Effect.Effect<ReturnType<typeof shortestPath>, CodeGraphError>;
    readonly explain: (
      graphId: string,
      nodeQuery: string,
      storagePath?: string
    ) => Effect.Effect<ReturnType<typeof explainNode>, CodeGraphError>;
    readonly subgraph: (
      graphId: string,
      seedQuery: string,
      maxDepth?: number,
      maxNodes?: number,
      storagePath?: string
    ) => Effect.Effect<ReturnType<typeof subgraph>, CodeGraphError>;
    readonly explore: (
      graphId: string,
      query: string,
      options?: {
        impactDepth?: number;
        neighborLimit?: number;
        subgraphDepth?: number;
        storagePath?: string;
      }
    ) => Effect.Effect<ReturnType<typeof exploreGraph>, CodeGraphError>;
    readonly impact: (
      graphId: string,
      seedQuery: string,
      depth?: number,
      limit?: number,
      storagePath?: string
    ) => Effect.Effect<ReturnType<typeof impactAnalysis>, CodeGraphError>;
    readonly importGraphify: (options: {
      jsonPath: string;
      graphId?: string;
      rootPath?: string;
      storagePath?: string;
    }) => Effect.Effect<{ summary: ReturnType<typeof documentSummary> }, CodeGraphError>;
  }
>() {}

function loadDoc(
  storage: CodeGraphStorage,
  graphId: string
): Effect.Effect<CodeGraphDocument, CodeGraphError> {
  return Effect.gen(function* () {
    const doc = yield* Effect.tryPromise({
      try: () => storage.get(graphId),
      catch: (e) => new CodeGraphError(String(e)),
    });
    if (!doc) return yield* Effect.fail(new CodeGraphError(`Code graph not found: ${graphId}`));
    return doc;
  });
}

export function makeCodeGraphServiceLive(storagePath?: string): Layer.Layer<CodeGraphService> {
  const storage = storageFromPath(storagePath);
  return Layer.succeed(CodeGraphService, {
    index: (options) =>
      Effect.tryPromise({
        try: async () => {
          const doc = await indexRepository(options);
          await storage.put(doc);
          return { summary: documentSummary(doc) };
        },
        catch: (e) => new CodeGraphError(String(e)),
      }),
    query: (graphId, query, limit, pathOverride) =>
      Effect.gen(function* () {
        const delegated = yield* Effect.tryPromise({
          try: () => maybeDelegateQuery(query, limit),
          catch: (e) => new CodeGraphError(String(e)),
        });
        if (delegated) return delegated;
        const store = storageFromPath(pathOverride);
        const doc = yield* loadDoc(store, graphId);
        return queryGraph(doc, query, limit);
      }),
    neighbors: (graphId, nodeId, options = {}) =>
      Effect.gen(function* () {
        const store = storageFromPath(options.storagePath);
        const doc = yield* loadDoc(store, graphId);
        return getNeighbors(doc, nodeId, options);
      }),
    path: (graphId, from, to, pathOverride) =>
      Effect.gen(function* () {
        const store = storageFromPath(pathOverride);
        const doc = yield* loadDoc(store, graphId);
        return shortestPath(doc, from, to);
      }),
    explain: (graphId, nodeQuery, pathOverride) =>
      Effect.gen(function* () {
        const store = storageFromPath(pathOverride);
        const doc = yield* loadDoc(store, graphId);
        const result = explainNode(doc, nodeQuery);
        if (!result) return yield* Effect.fail(new CodeGraphError(`Node not found for: ${nodeQuery}`));
        return result;
      }),
    subgraph: (graphId, seedQuery, maxDepth, maxNodes, pathOverride) =>
      Effect.gen(function* () {
        const store = storageFromPath(pathOverride);
        const doc = yield* loadDoc(store, graphId);
        return subgraph(doc, seedQuery, maxDepth, maxNodes);
      }),
    explore: (graphId, query, options = {}) =>
      Effect.gen(function* () {
        const store = storageFromPath(options.storagePath);
        const doc = yield* loadDoc(store, graphId);
        return exploreGraph(doc, query, options);
      }),
    impact: (graphId, seedQuery, depth, limit, pathOverride) =>
      Effect.gen(function* () {
        const store = storageFromPath(pathOverride);
        const doc = yield* loadDoc(store, graphId);
        return impactAnalysis(doc, seedQuery, depth, limit);
      }),
    importGraphify: (options) =>
      Effect.tryPromise({
        try: async () => {
          const doc = await importGraphifyFromPath(options);
          const store = storageFromPath(options.storagePath);
          await store.put(doc);
          return { summary: documentSummary(doc) };
        },
        catch: (e) => new CodeGraphError(String(e)),
      }),
  });
}

async function maybeDelegateQuery(
  query: string,
  limit?: number
): Promise<ReturnType<typeof queryGraph> | null> {
  if (!graphifyMcpDelegateEnabled()) return null;
  const raw = await graphifyMcpQuery("query_graph", { query, limit: limit ?? 20 });
  if (Array.isArray(raw)) return raw as ReturnType<typeof queryGraph>;
  if (raw && typeof raw === "object" && Array.isArray((raw as { results?: unknown }).results)) {
    return (raw as { results: ReturnType<typeof queryGraph> }).results;
  }
  return null;
}

export function runCodeGraphEffect<A, E>(
  program: Effect.Effect<A, E, CodeGraphService>,
  storagePath?: string
): Promise<A> {
  return Effect.runPromise(program.pipe(Effect.provide(makeCodeGraphServiceLive(storagePath))));
}
