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

/** MCP `audit` tool ring buffer — aggregates only (no per-event labels). */
const auditAppendCounter = new Counter({
  name: "clawql_audit_append_total",
  help: "Total MCP audit append calls.",
  registers: [registry],
});

const auditRingDroppedCounter = new Counter({
  name: "clawql_audit_ring_entries_dropped_total",
  help: "Audit entries evicted from the ring buffer due to CLAWQL_AUDIT_MAX_ENTRIES (sum of per-append dropped counts).",
  registers: [registry],
});

const auditClearCounter = new Counter({
  name: "clawql_audit_clear_total",
  help: "Total MCP audit clear calls.",
  registers: [registry],
});

const auditBufferGauge = new Gauge({
  name: "clawql_audit_buffer_entries",
  help: "Current audit ring buffer entry count.",
  registers: [registry],
});

auditBufferGauge.set(0);

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

/** Record audit MCP mutations for GET /metrics (stdio and HTTP processes). */
export function prometheusRecordAuditAppend(bufferSizeAfter: number, dropped: number): void {
  auditAppendCounter.inc();
  if (dropped > 0) {
    auditRingDroppedCounter.inc(dropped);
  }
  auditBufferGauge.set(bufferSizeAfter);
}

export function prometheusRecordAuditClear(): void {
  auditClearCounter.inc();
  auditBufferGauge.set(0);
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
  auditBufferGauge.set(0);
}
