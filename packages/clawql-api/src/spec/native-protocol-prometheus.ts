/**
 * First-class Prometheus exposition for native GraphQL/gRPC protocol metrics (ADR #191).
 * **`GET /metrics`** on **`clawql-mcp-http`** when **`CLAWQL_ENABLE_HTTP_METRICS`** is on (default).
 *
 * `prom-client` is createRequire-loaded on first scrape / test reset so Ready listen
 * (spec merge + tool-call) does not evaluate the Prometheus registry (~8–10 MB RSS).
 * Mutators keep a shadow state until the registry is materialised; `/metrics` then
 * applies the shadow and serves live counters.
 */

import { createRequire } from "node:module";
import { Effect } from "effect";

const requireProm = createRequire(import.meta.url);

type PromClient = typeof import("prom-client");
type Registry = InstanceType<PromClient["Registry"]>;
type Counter = InstanceType<PromClient["Counter"]>;
type Gauge = InstanceType<PromClient["Gauge"]>;

type SourceBucket = {
  mergedOperations: number;
  executeOk: number;
  executeErr: number;
};

type ShadowState = {
  graphqlBySource: Map<string, SourceBucket>;
  grpcBySource: Map<string, SourceBucket>;
  auditAppendTotal: number;
  auditRingDroppedTotal: number;
  auditClearTotal: number;
  auditBufferEntries: number;
};

const shadow: ShadowState = {
  graphqlBySource: new Map(),
  grpcBySource: new Map(),
  auditAppendTotal: 0,
  auditRingDroppedTotal: 0,
  auditClearTotal: 0,
  auditBufferEntries: 0,
};

type LiveRegistry = {
  registry: Registry;
  graphqlMergeGauge: Gauge;
  grpcMergeGauge: Gauge;
  graphqlExecuteCounter: Counter;
  grpcExecuteCounter: Counter;
  auditAppendCounter: Counter;
  auditRingDroppedCounter: Counter;
  auditClearCounter: Counter;
  auditBufferGauge: Gauge;
};

let live: LiveRegistry | null = null;

function ensureBucket(map: Map<string, SourceBucket>, label: string): SourceBucket {
  let row = map.get(label);
  if (!row) {
    row = { mergedOperations: 0, executeOk: 0, executeErr: 0 };
    map.set(label, row);
  }
  return row;
}

function loadPromClient(): PromClient {
  return requireProm("prom-client") as PromClient;
}

function applyShadowToLive(state: LiveRegistry): void {
  for (const [source, row] of shadow.graphqlBySource) {
    state.graphqlMergeGauge.set({ source }, row.mergedOperations);
    if (row.executeOk > 0) {
      state.graphqlExecuteCounter.inc({ source, outcome: "ok" }, row.executeOk);
    }
    if (row.executeErr > 0) {
      state.graphqlExecuteCounter.inc({ source, outcome: "error" }, row.executeErr);
    }
  }
  for (const [source, row] of shadow.grpcBySource) {
    state.grpcMergeGauge.set({ source }, row.mergedOperations);
    if (row.executeOk > 0) {
      state.grpcExecuteCounter.inc({ source, outcome: "ok" }, row.executeOk);
    }
    if (row.executeErr > 0) {
      state.grpcExecuteCounter.inc({ source, outcome: "error" }, row.executeErr);
    }
  }
  if (shadow.auditAppendTotal > 0) {
    state.auditAppendCounter.inc(shadow.auditAppendTotal);
  }
  if (shadow.auditRingDroppedTotal > 0) {
    state.auditRingDroppedCounter.inc(shadow.auditRingDroppedTotal);
  }
  if (shadow.auditClearTotal > 0) {
    state.auditClearCounter.inc(shadow.auditClearTotal);
  }
  state.auditBufferGauge.set(shadow.auditBufferEntries);
}

function ensureLiveRegistry(): LiveRegistry {
  if (live) return live;
  const prom = loadPromClient();
  const registry = new prom.Registry();
  const graphqlMergeGauge = new prom.Gauge({
    name: "clawql_native_protocol_graphql_merge_operations",
    help: "Native GraphQL merged operations per sourceLabel (gauge; refreshed when native ops are merged at spec load).",
    labelNames: ["source"],
    registers: [registry],
  });
  const grpcMergeGauge = new prom.Gauge({
    name: "clawql_native_protocol_grpc_merge_operations",
    help: "Native gRPC merged operations per sourceLabel (gauge; refreshed when native ops are merged at spec load).",
    labelNames: ["source"],
    registers: [registry],
  });
  const graphqlExecuteCounter = new prom.Counter({
    name: "clawql_native_protocol_graphql_execute_total",
    help: "Total native GraphQL execute attempts per sourceLabel.",
    labelNames: ["source", "outcome"],
    registers: [registry],
  });
  const grpcExecuteCounter = new prom.Counter({
    name: "clawql_native_protocol_grpc_execute_total",
    help: "Total native gRPC unary execute attempts per sourceLabel.",
    labelNames: ["source", "outcome"],
    registers: [registry],
  });
  const auditAppendCounter = new prom.Counter({
    name: "clawql_audit_append_total",
    help: "Total MCP audit append calls.",
    registers: [registry],
  });
  const auditRingDroppedCounter = new prom.Counter({
    name: "clawql_audit_ring_entries_dropped_total",
    help: "Audit entries evicted from the ring buffer due to CLAWQL_AUDIT_MAX_ENTRIES (sum of per-append dropped counts).",
    registers: [registry],
  });
  const auditClearCounter = new prom.Counter({
    name: "clawql_audit_clear_total",
    help: "Total MCP audit clear calls.",
    registers: [registry],
  });
  const auditBufferGauge = new prom.Gauge({
    name: "clawql_audit_buffer_entries",
    help: "Current audit ring buffer entry count.",
    registers: [registry],
  });
  auditBufferGauge.set(0);
  live = {
    registry,
    graphqlMergeGauge,
    grpcMergeGauge,
    graphqlExecuteCounter,
    grpcExecuteCounter,
    auditAppendCounter,
    auditRingDroppedCounter,
    auditClearCounter,
    auditBufferGauge,
  };
  applyShadowToLive(live);
  return live;
}

function removeStaleMergeLabels(gauge: Gauge, prev: Set<string>, nextKeys: Iterable<string>): void {
  const next = new Set(nextKeys);
  for (const source of prev) {
    if (!next.has(source)) {
      gauge.remove({ source });
    }
  }
}

let prevGqlMergeSources = new Set<string>();
let prevGrpcMergeSources = new Set<string>();

function syncShadowMerge(
  map: Map<string, SourceBucket>,
  nextKeys: ReadonlyMap<string, { mergedOperations: number }>
): void {
  const seen = new Set<string>();
  for (const [source, row] of nextKeys) {
    seen.add(source);
    ensureBucket(map, source).mergedOperations = row.mergedOperations;
  }
  for (const source of map.keys()) {
    if (!seen.has(source)) {
      map.get(source)!.mergedOperations = 0;
    }
  }
}

/** Called after native-protocol merge maps are updated in memory. */
export function prometheusSyncMergeFromMaps(
  gqlBySource: ReadonlyMap<string, { mergedOperations: number }>,
  grpcBySource: ReadonlyMap<string, { mergedOperations: number }>
): void {
  syncShadowMerge(shadow.graphqlBySource, gqlBySource);
  syncShadowMerge(shadow.grpcBySource, grpcBySource);
  if (!live) return;
  removeStaleMergeLabels(live.graphqlMergeGauge, prevGqlMergeSources, gqlBySource.keys());
  for (const [source, row] of gqlBySource) {
    live.graphqlMergeGauge.set({ source }, row.mergedOperations);
  }
  prevGqlMergeSources = new Set(gqlBySource.keys());

  removeStaleMergeLabels(live.grpcMergeGauge, prevGrpcMergeSources, grpcBySource.keys());
  for (const [source, row] of grpcBySource) {
    live.grpcMergeGauge.set({ source }, row.mergedOperations);
  }
  prevGrpcMergeSources = new Set(grpcBySource.keys());
}

export function prometheusIncGraphqlExecute(sourceLabel: string, ok: boolean): void {
  const row = ensureBucket(shadow.graphqlBySource, sourceLabel);
  if (ok) row.executeOk += 1;
  else row.executeErr += 1;
  if (!live) return;
  live.graphqlExecuteCounter.inc({ source: sourceLabel, outcome: ok ? "ok" : "error" });
}

export function prometheusIncGrpcExecute(sourceLabel: string, ok: boolean): void {
  const row = ensureBucket(shadow.grpcBySource, sourceLabel);
  if (ok) row.executeOk += 1;
  else row.executeErr += 1;
  if (!live) return;
  live.grpcExecuteCounter.inc({ source: sourceLabel, outcome: ok ? "ok" : "error" });
}

/** Record audit MCP mutations for GET /metrics (stdio and HTTP processes). */
export function prometheusRecordAuditAppend(bufferSizeAfter: number, dropped: number): void {
  shadow.auditAppendTotal += 1;
  if (dropped > 0) shadow.auditRingDroppedTotal += dropped;
  shadow.auditBufferEntries = bufferSizeAfter;
  if (!live) return;
  live.auditAppendCounter.inc();
  if (dropped > 0) live.auditRingDroppedCounter.inc(dropped);
  live.auditBufferGauge.set(bufferSizeAfter);
}

export function prometheusRecordAuditClear(): void {
  shadow.auditClearTotal += 1;
  shadow.auditBufferEntries = 0;
  if (!live) return;
  live.auditClearCounter.inc();
  live.auditBufferGauge.set(0);
}

/** `1`, `true`, `yes` → on; unset → default **on**; `0` / `false` / other → off. */
function envTruthyWithDefault(v: string | undefined, defaultWhenUnset: boolean): boolean {
  if (v === undefined) return defaultWhenUnset;
  const t = v.trim().toLowerCase();
  return t === "1" || t === "true" || t === "yes";
}

/** Whether **`GET /metrics`** is mounted on MCP HTTP (default **true**). Opt out with **`CLAWQL_ENABLE_HTTP_METRICS=0`**. */
export function httpMetricsEnabledForHttp(): boolean {
  return envTruthyWithDefault(process.env.CLAWQL_ENABLE_HTTP_METRICS, true);
}

async function renderPrometheusMetricsImpl(): Promise<{ body: string; contentType: string }> {
  const { registry } = ensureLiveRegistry();
  const body = await registry.metrics();
  return { body, contentType: registry.contentType };
}

export function renderPrometheusMetricsEffect(): Effect.Effect<
  { body: string; contentType: string },
  Error
> {
  return Effect.tryPromise({
    try: () => renderPrometheusMetricsImpl(),
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
}

/** Promise façade — prefer {@link renderPrometheusMetricsEffect} for Effect callers. */
export async function renderPrometheusMetrics(): Promise<{ body: string; contentType: string }> {
  return Effect.runPromise(renderPrometheusMetricsEffect());
}

/** Vitest — resets gauges/counters and merge label tracking (matches native-protocol-metrics reset). */
export function resetNativeProtocolPrometheusForTests(): void {
  shadow.graphqlBySource.clear();
  shadow.grpcBySource.clear();
  shadow.auditAppendTotal = 0;
  shadow.auditRingDroppedTotal = 0;
  shadow.auditClearTotal = 0;
  shadow.auditBufferEntries = 0;
  prevGqlMergeSources.clear();
  prevGrpcMergeSources.clear();
  if (live) {
    live.registry.resetMetrics();
    live.auditBufferGauge.set(0);
  }
  live = null;
}
