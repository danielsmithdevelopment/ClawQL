/**
 * Merge native GraphQL / gRPC operations into a loaded OpenAPI/Discovery spec (ADR 0002).
 */

import { loadGraphqlNativeOperations } from "./graphql-native-loader.js";
import { loadGrpcNativeOperations } from "./grpc-native-loader.js";
import { recordNativeMergeFromOperations } from "./native-protocol-metrics.js";
import type { LoadedSpec } from "./spec-loader.js";
import type { Operation } from "./operation-types.js";

export async function mergeNativeProtocolOperations(loaded: LoadedSpec): Promise<LoadedSpec> {
  let gql: Operation[] = [];
  let grpc: Operation[] = [];
  try {
    gql = await loadGraphqlNativeOperations();
  } catch (e: unknown) {
    console.error("[spec-loader] Native GraphQL merge failed:", e);
  }
  try {
    grpc = await loadGrpcNativeOperations();
  } catch (e: unknown) {
    console.error("[spec-loader] Native gRPC merge failed:", e);
  }

  recordNativeMergeFromOperations(gql, grpc);
  const extra = gql.concat(grpc);

  if (extra.length === 0) return loaded;

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

  return {
    ...loaded,
    operations: merged,
  };
}
