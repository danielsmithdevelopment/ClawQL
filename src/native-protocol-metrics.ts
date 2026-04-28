/**
 * Lightweight counters for native GraphQL/gRPC merge + execute (ADR #191).
 * Optional **`CLAWQL_HEALTHZ_NATIVE_PROTOCOL_METRICS=1`** exposes a snapshot on **`GET /healthz`**.
 * Prometheus text exposition is always recorded to the native-protocol registry; **`GET /metrics`**
 * serves it unless **`CLAWQL_DISABLE_HTTP_METRICS=1`** (see **`native-protocol-prometheus.ts`**).
 *
 * **`graphqlBySource`** / **`grpcBySource`**: same totals as top-level counters when summed, split by
 * **`sourceLabel`** from native protocol config (merge counts per load, execute counters cumulative).
 */

import type { Operation } from "./operation-types.js";
import {
  prometheusIncGraphqlExecute,
  prometheusIncGrpcExecute,
  prometheusSyncMergeFromMaps,
  resetNativeProtocolPrometheusForTests,
} from "./native-protocol-prometheus.js";

export type NativeProtocolSourceMetricsSnapshot = {
  mergedOperations: number;
  executeOk: number;
  executeErr: number;
};

let graphqlMergedOps = 0;
let grpcMergedOps = 0;
let graphqlExecuteOk = 0;
let graphqlExecuteErr = 0;
let grpcExecuteOk = 0;
let grpcExecuteErr = 0;

type SourceBucket = NativeProtocolSourceMetricsSnapshot;

const graphqlBySource = new Map<string, SourceBucket>();
const grpcBySource = new Map<string, SourceBucket>();

function ensureBucket(map: Map<string, SourceBucket>, label: string): SourceBucket {
  let row = map.get(label);
  if (!row) {
    row = { mergedOperations: 0, executeOk: 0, executeErr: 0 };
    map.set(label, row);
  }
  return row;
}

function countMergedByLabel(
  ops: Operation[],
  pick: (op: Operation) => string | undefined
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const op of ops) {
    const label = pick(op) ?? "_unknown";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return counts;
}

/** Sync gauge-like **`mergedOperations`** from spec merge; preserves execute counters per label. */
function syncMergedGauge(map: Map<string, SourceBucket>, counts: Map<string, number>): void {
  const seen = new Set<string>();
  for (const [label, n] of counts) {
    seen.add(label);
    ensureBucket(map, label).mergedOperations = n;
  }
  for (const label of map.keys()) {
    if (!seen.has(label)) {
      map.get(label)!.mergedOperations = 0;
    }
  }
}

export function recordNativeMergeFromOperations(gql: Operation[], grpc: Operation[]): void {
  graphqlMergedOps = gql.length;
  grpcMergedOps = grpc.length;
  syncMergedGauge(
    graphqlBySource,
    countMergedByLabel(gql, (op) => op.nativeGraphQL?.sourceLabel)
  );
  syncMergedGauge(
    grpcBySource,
    countMergedByLabel(grpc, (op) => op.nativeGrpc?.sourceLabel)
  );
  prometheusSyncMergeFromMaps(graphqlBySource, grpcBySource);
}

export function recordNativeGraphqlExecute(ok: boolean, sourceLabel?: string): void {
  const label = sourceLabel ?? "_unknown";
  if (ok) graphqlExecuteOk += 1;
  else graphqlExecuteErr += 1;
  const row = ensureBucket(graphqlBySource, label);
  if (ok) row.executeOk += 1;
  else row.executeErr += 1;
  prometheusIncGraphqlExecute(label, ok);
  prometheusSyncMergeFromMaps(graphqlBySource, grpcBySource);
}

export function recordNativeGrpcExecute(ok: boolean, sourceLabel?: string): void {
  const label = sourceLabel ?? "_unknown";
  if (ok) grpcExecuteOk += 1;
  else grpcExecuteErr += 1;
  const row = ensureBucket(grpcBySource, label);
  if (ok) row.executeOk += 1;
  else row.executeErr += 1;
  prometheusIncGrpcExecute(label, ok);
  prometheusSyncMergeFromMaps(graphqlBySource, grpcBySource);
}

export function nativeProtocolMetricsEnabled(): boolean {
  return process.env.CLAWQL_HEALTHZ_NATIVE_PROTOCOL_METRICS?.trim() === "1";
}

function mapSnapshot(
  map: Map<string, SourceBucket>
): Record<string, NativeProtocolSourceMetricsSnapshot> {
  const out: Record<string, NativeProtocolSourceMetricsSnapshot> = {};
  for (const [k, v] of map) {
    out[k] = {
      mergedOperations: v.mergedOperations,
      executeOk: v.executeOk,
      executeErr: v.executeErr,
    };
  }
  return out;
}

export function getNativeProtocolMetricsSnapshot(): Record<string, unknown> {
  return {
    graphqlMergedOperations: graphqlMergedOps,
    grpcMergedOperations: grpcMergedOps,
    graphqlExecuteOk,
    graphqlExecuteErr,
    grpcExecuteOk,
    grpcExecuteErr,
    graphqlBySource: mapSnapshot(graphqlBySource),
    grpcBySource: mapSnapshot(grpcBySource),
  };
}

/** Vitest only — resets counters between tests. */
export function resetNativeProtocolMetricsForTests(): void {
  graphqlMergedOps = 0;
  grpcMergedOps = 0;
  graphqlExecuteOk = 0;
  graphqlExecuteErr = 0;
  grpcExecuteOk = 0;
  grpcExecuteErr = 0;
  graphqlBySource.clear();
  grpcBySource.clear();
  resetNativeProtocolPrometheusForTests();
}
