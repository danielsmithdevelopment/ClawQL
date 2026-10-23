/**
 * Merge native GraphQL / gRPC operations into a loaded OpenAPI/Discovery spec (ADR 0002).
 *
 * Loaders are dynamic-imported so Ready/LOAD=db never evaluates `graphql` /
 * `@grpc/grpc-js` / swagger at module init.
 */

import { recordNativeMergeFromOperations } from "./native-protocol-metrics.js";
import type { LoadedSpec } from "./spec-loader.js";
import type { Operation } from "./operation-types.js";
import { Effect } from "effect";

async function mergeNativeProtocolOperationsImpl(loaded: LoadedSpec): Promise<LoadedSpec> {
  let gql: Operation[] = [];
  let grpc: Operation[] = [];
  try {
    const { loadGraphqlNativeOperations } = await import("./graphql-native-loader.js");
    gql = await loadGraphqlNativeOperations();
  } catch (e: unknown) {
    console.error("[spec-loader] Native GraphQL merge failed:", e);
  }
  try {
    const { loadGrpcNativeOperations } = await import("./grpc-native-loader.js");
    grpc = await loadGrpcNativeOperations();
  } catch (e: unknown) {
    console.error("[spec-loader] Native gRPC merge failed:", e);
  }

  recordNativeMergeFromOperations(gql, grpc);
  const extra = gql.concat(grpc);

  const { mergeCustomSourceOperations } = await import("./custom-sources-merge.js");

  if (extra.length === 0) {
    // Still merge ~/.ClawQL/sources.json (CLI / MCP / OpenAPI custom sources).
    return mergeCustomSourceOperations(loaded);
  }

  const seen = new Set(loaded.operations.map((o) => o.id));
  const merged: Operation[] = [...loaded.operations];

  for (const op of extra) {
    let id = op.id;
    if (seen.has(id)) {
      id = `${op.specLabel ?? "native"}::${op.id}`;
      let n = 2;
      while (seen.has(id)) {
        id = `${op.specLabel ?? "native"}::${op.id}__${n++}`;
      }
    }
    seen.add(id);
    merged.push(id === op.id ? op : { ...op, id });
  }

  console.error(
    `[spec-loader] Merged ${extra.length} native protocol operations (GraphQL/gRPC). ` +
      (loaded.multi
        ? "OpenAPI ops still use REST; native ops use HTTP GraphQL or gRPC."
        : "Execute routes native ops by protocolKind.")
  );

  return mergeCustomSourceOperations({
    ...loaded,
    operations: merged,
  });
}

export function mergeNativeProtocolOperationsEffect(
  loaded: LoadedSpec
): Effect.Effect<LoadedSpec, Error> {
  return Effect.tryPromise({
    try: () => mergeNativeProtocolOperationsImpl(loaded),
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
}

/** Promise façade — prefer {@link mergeNativeProtocolOperationsEffect} for Effect callers. */
export async function mergeNativeProtocolOperations(loaded: LoadedSpec): Promise<LoadedSpec> {
  return Effect.runPromise(mergeNativeProtocolOperationsEffect(loaded));
}
