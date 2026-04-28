/**
 * First-class Prometheus exposition for native GraphQL/gRPC protocol metrics (ADR #191).
 * **`GET /metrics`** on **`clawql-mcp-http`** (unless **`CLAWQL_DISABLE_HTTP_METRICS=1`**).
 */

import { Counter, Gauge, Registry } from "prom-client";

const registry = new Registry();

const graphqlMergeGauge = new Gauge({
  name: "clawql_native_protocol_graphql_merge_operations",
  help: "Native GraphQL merged operations per sourceLabel (gauge; refreshed when native ops are merged at spec load).",
  labelNames: ["source"],
  registers: [registry],
});

const grpcMergeGauge = new Gauge({
  name: "clawql_native_protocol_grpc_merge_operations",
  help: "Native gRPC merged operations per sourceLabel (gauge; refreshed when native ops are merged at spec load).",
  labelNames: ["source"],
  registers: [registry],
});

const graphqlExecuteCounter = new Counter({
  name: "clawql_native_protocol_graphql_execute_total",
  help: "Total native GraphQL execute attempts per sourceLabel.",
  labelNames: ["source", "outcome"],
  registers: [registry],
});

const grpcExecuteCounter = new Counter({
  name: "clawql_native_protocol_grpc_execute_total",
  help: "Total native gRPC unary execute attempts per sourceLabel.",
  labelNames: ["source", "outcome"],
  registers: [registry],
});

let prevGqlMergeSources = new Set<string>();
let prevGrpcMergeSources = new Set<string>();

function removeStaleMergeLabels(
  gauge: Gauge<"source">,
  prev: Set<string>,
  nextKeys: Iterable<string>
): void {
  const next = new Set(nextKeys);
  for (const source of prev) {
    if (!next.has(source)) {
      gauge.remove({ source });
    }
  }
}

/** Called after native-protocol merge maps are updated in memory. */
export function prometheusSyncMergeFromMaps(
  gqlBySource: ReadonlyMap<string, { mergedOperations: number }>,
  grpcBySource: ReadonlyMap<string, { mergedOperations: number }>
): void {
  removeStaleMergeLabels(graphqlMergeGauge, prevGqlMergeSources, gqlBySource.keys());
  for (const [source, row] of gqlBySource) {
    graphqlMergeGauge.set({ source }, row.mergedOperations);
  }
  prevGqlMergeSources = new Set(gqlBySource.keys());

  removeStaleMergeLabels(grpcMergeGauge, prevGrpcMergeSources, grpcBySource.keys());
  for (const [source, row] of grpcBySource) {
    grpcMergeGauge.set({ source }, row.mergedOperations);
  }
  prevGrpcMergeSources = new Set(grpcBySource.keys());
}

export function prometheusIncGraphqlExecute(sourceLabel: string, ok: boolean): void {
  graphqlExecuteCounter.inc({ source: sourceLabel, outcome: ok ? "ok" : "error" });
}

export function prometheusIncGrpcExecute(sourceLabel: string, ok: boolean): void {
  grpcExecuteCounter.inc({ source: sourceLabel, outcome: ok ? "ok" : "error" });
}

export function prometheusDisabledForHttp(): boolean {
  return process.env.CLAWQL_DISABLE_HTTP_METRICS?.trim() === "1";
}

export async function renderPrometheusMetrics(): Promise<{ body: string; contentType: string }> {
  const body = await registry.metrics();
  return { body, contentType: registry.contentType };
}

/** Vitest — resets gauges/counters and merge label tracking (matches native-protocol-metrics reset). */
export function resetNativeProtocolPrometheusForTests(): void {
  registry.resetMetrics();
  prevGqlMergeSources.clear();
  prevGrpcMergeSources.clear();
}
