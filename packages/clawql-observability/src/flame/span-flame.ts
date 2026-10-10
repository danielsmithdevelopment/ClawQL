/**
 * OTEL / Tempo span flamegraph model (LGTM+).
 *
 * Distinct from mcp-ui token context flamegraphs (`/mcp-ui/trace`): this visualizes
 * wall-clock spans (self time + inclusive) for a single distributed trace so agents
 * can spot gateway / tool-call overhead without opening Grafana.
 */

import { Effect } from "effect";

export type FlatSpan = {
  readonly spanId: string;
  readonly parentSpanId: string | null;
  readonly name: string;
  readonly serviceName: string;
  /** Unix epoch ms */
  readonly startMs: number;
  readonly endMs: number;
  readonly status: "ok" | "error" | "unset";
};

export type SpanFlameNode = {
  readonly spanId: string;
  readonly name: string;
  readonly serviceName: string;
  readonly startMs: number;
  readonly durationMs: number;
  readonly selfMs: number;
  readonly depth: number;
  readonly status: FlatSpan["status"];
  readonly children: readonly SpanFlameNode[];
};

export type SpanSelfTimeRow = {
  readonly spanId: string;
  readonly name: string;
  readonly serviceName: string;
  readonly selfMs: number;
  readonly durationMs: number;
};

export type SpanFlamegraph = {
  readonly traceId: string;
  readonly rootStartMs: number;
  readonly totalDurationMs: number;
  readonly spanCount: number;
  readonly serviceCount: number;
  readonly services: readonly { readonly name: string; readonly selfMs: number }[];
  readonly roots: readonly SpanFlameNode[];
  readonly mostSelfTime: readonly SpanSelfTimeRow[];
  readonly honesty: string;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return v != null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function attrString(attrs: unknown, key: string): string | null {
  if (!Array.isArray(attrs)) return null;
  for (const a of attrs) {
    const row = asRecord(a);
    if (!row || row.key !== key) continue;
    const value = asRecord(row.value);
    if (!value) continue;
    if (typeof value.stringValue === "string") return value.stringValue;
    if (typeof value.string_value === "string") return value.string_value;
  }
  return null;
}

function nanoToMs(n: number | string | undefined): number {
  if (n == null) return 0;
  const v = typeof n === "string" ? Number(n) : n;
  if (!Number.isFinite(v)) return 0;
  // Heuristic: ns timestamps are >> 1e15; µs Jaeger startTime ~1e15; ms ~1e12
  if (v > 1e16) return v / 1e6; // ns → ms
  if (v > 1e14) return v / 1e3; // µs → ms
  return v;
}

function normalizeStatus(raw: unknown): FlatSpan["status"] {
  const rec = asRecord(raw);
  const code = rec?.code ?? rec?.status;
  if (code === 2 || code === "STATUS_CODE_ERROR" || code === "error" || code === "ERROR") {
    return "error";
  }
  if (code === 1 || code === "STATUS_CODE_OK" || code === "ok" || code === "OK") return "ok";
  return "unset";
}

/** Parse Tempo `/api/traces/{id}` (Jaeger or OTLP) into flat spans. */
export function parseTempoTracePayloadEffect(
  payload: unknown,
  traceIdHint?: string
): Effect.Effect<{ readonly traceId: string; readonly spans: readonly FlatSpan[] }> {
  return Effect.sync(() => {
    const root = asRecord(payload) ?? {};
    // Jaeger: { data: [ { traceID, spans, processes } ] }
    const data = Array.isArray(root.data) ? root.data : null;
    if (data && data[0]) {
      const trace = asRecord(data[0]) ?? {};
      const processes = asRecord(trace.processes) ?? {};
      const spansRaw = Array.isArray(trace.spans) ? trace.spans : [];
      const spans: FlatSpan[] = [];
      for (const s of spansRaw) {
        const row = asRecord(s);
        if (!row) continue;
        const spanId = String(row.spanID ?? row.spanId ?? "");
        if (!spanId) continue;
        const refs = Array.isArray(row.references) ? row.references : [];
        let parent: string | null = null;
        for (const r of refs) {
          const ref = asRecord(r);
          if (ref && (ref.refType === "CHILD_OF" || ref.refType === "CHILD_OF".toLowerCase())) {
            parent = String(ref.spanID ?? ref.spanId ?? "") || null;
            break;
          }
        }
        const procId = String(row.processID ?? row.processId ?? "");
        const proc = asRecord(processes[procId]);
        const serviceName = String(proc?.serviceName ?? proc?.service_name ?? "unknown");
        const startMs = nanoToMs(row.startTime as number | string | undefined);
        const durationMs = nanoToMs(row.duration as number | string | undefined);
        spans.push({
          spanId,
          parentSpanId: parent,
          name: String(row.operationName ?? row.name ?? "span"),
          serviceName,
          startMs,
          endMs: startMs + durationMs,
          status: normalizeStatus(row.tags),
        });
      }
      return {
        traceId: String(trace.traceID ?? trace.traceId ?? traceIdHint ?? "unknown"),
        spans,
      };
    }

    // OTLP: { batches: [ { resource, scopeSpans } ] } or { resourceSpans: [...] }
    const batches = Array.isArray(root.batches)
      ? root.batches
      : Array.isArray(root.resourceSpans)
        ? [{ resourceSpans: root.resourceSpans }]
        : Array.isArray(asRecord(root.trace)?.batches)
          ? (asRecord(root.trace)!.batches as unknown[])
          : [];

    const spans: FlatSpan[] = [];
    let traceId = traceIdHint ?? "unknown";
    for (const batch of batches) {
      const b = asRecord(batch) ?? {};
      const resource = asRecord(b.resource);
      const serviceName =
        attrString(resource?.attributes, "service.name") ??
        attrString(resource?.attributes, "service_name") ??
        "unknown";
      const resourceSpans = Array.isArray(b.resourceSpans)
        ? b.resourceSpans
        : Array.isArray(b.scopeSpans)
          ? [b]
          : [];
      for (const rs of resourceSpans) {
        const rsRec = asRecord(rs) ?? {};
        const rsService =
          attrString(asRecord(rsRec.resource)?.attributes, "service.name") ?? serviceName;
        const scopeSpans = Array.isArray(rsRec.scopeSpans)
          ? rsRec.scopeSpans
          : Array.isArray(rsRec.instrumentationLibrarySpans)
            ? rsRec.instrumentationLibrarySpans
            : Array.isArray(b.scopeSpans)
              ? b.scopeSpans
              : [];
        for (const ss of scopeSpans) {
          const ssRec = asRecord(ss) ?? {};
          const spanList = Array.isArray(ssRec.spans) ? ssRec.spans : [];
          for (const s of spanList) {
            const row = asRecord(s);
            if (!row) continue;
            const spanId = String(row.spanId ?? row.span_id ?? "");
            if (!spanId) continue;
            const tid = String(row.traceId ?? row.trace_id ?? "");
            if (tid) traceId = tid;
            const parent = row.parentSpanId ?? row.parent_span_id;
            const startMs = nanoToMs(
              (row.startTimeUnixNano ?? row.start_time_unix_nano) as number | string | undefined
            );
            const endMs = nanoToMs(
              (row.endTimeUnixNano ?? row.end_time_unix_nano) as number | string | undefined
            );
            spans.push({
              spanId,
              parentSpanId: parent ? String(parent) : null,
              name: String(row.name ?? "span"),
              serviceName: rsService,
              startMs,
              endMs: endMs > startMs ? endMs : startMs,
              status: normalizeStatus(row.status),
            });
          }
        }
      }
    }

    return { traceId, spans };
  });
}

export function buildSpanFlamegraphEffect(
  traceId: string,
  spans: readonly FlatSpan[],
  mostSelfLimit = 12
): Effect.Effect<SpanFlamegraph> {
  return Effect.sync(() => {
    if (spans.length === 0) {
      return {
        traceId,
        rootStartMs: 0,
        totalDurationMs: 0,
        spanCount: 0,
        serviceCount: 0,
        services: [],
        roots: [],
        mostSelfTime: [],
        honesty:
          "No spans in Tempo payload — confirm OTLP ingest (Alloy → Tempo) and trace id. Pyroscope CPU profiles remain via observability_query_profiles.",
      };
    }

    const byId = new Map<string, FlatSpan>();
    for (const s of spans) byId.set(s.spanId, s);

    const children = new Map<string, string[]>();
    const roots: string[] = [];
    for (const s of spans) {
      const parent = s.parentSpanId && byId.has(s.parentSpanId) ? s.parentSpanId : null;
      if (!parent) {
        roots.push(s.spanId);
        continue;
      }
      const list = children.get(parent) ?? [];
      list.push(s.spanId);
      children.set(parent, list);
    }

    const selfMsById = new Map<string, number>();
    for (const s of spans) {
      const duration = Math.max(0, s.endMs - s.startMs);
      const kids = children.get(s.spanId) ?? [];
      let childSum = 0;
      for (const cid of kids) {
        const c = byId.get(cid)!;
        childSum += Math.max(0, c.endMs - c.startMs);
      }
      selfMsById.set(s.spanId, Math.max(0, duration - childSum));
    }

    const buildNode = (id: string, depth: number): SpanFlameNode => {
      const s = byId.get(id)!;
      const kids = (children.get(id) ?? [])
        .slice()
        .sort((a, b) => (byId.get(a)!.startMs) - (byId.get(b)!.startMs))
        .map((cid) => buildNode(cid, depth + 1));
      return {
        spanId: s.spanId,
        name: s.name,
        serviceName: s.serviceName,
        startMs: s.startMs,
        durationMs: Math.max(0, s.endMs - s.startMs),
        selfMs: selfMsById.get(id) ?? 0,
        depth,
        status: s.status,
        children: kids,
      };
    };

    const rootNodes = roots
      .slice()
      .sort((a, b) => byId.get(a)!.startMs - byId.get(b)!.startMs)
      .map((id) => buildNode(id, 0));

    const rootStartMs = Math.min(...spans.map((s) => s.startMs));
    const rootEndMs = Math.max(...spans.map((s) => s.endMs));
    const totalDurationMs = Math.max(0, rootEndMs - rootStartMs);

    const serviceSelf = new Map<string, number>();
    for (const s of spans) {
      const self = selfMsById.get(s.spanId) ?? 0;
      serviceSelf.set(s.serviceName, (serviceSelf.get(s.serviceName) ?? 0) + self);
    }
    const services = [...serviceSelf.entries()]
      .map(([name, selfMs]) => ({ name, selfMs }))
      .sort((a, b) => b.selfMs - a.selfMs);

    const mostSelfTime = [...spans]
      .map((s) => ({
        spanId: s.spanId,
        name: s.name,
        serviceName: s.serviceName,
        selfMs: selfMsById.get(s.spanId) ?? 0,
        durationMs: Math.max(0, s.endMs - s.startMs),
      }))
      .sort((a, b) => b.selfMs - a.selfMs)
      .slice(0, mostSelfLimit);

    return {
      traceId,
      rootStartMs,
      totalDurationMs,
      spanCount: spans.length,
      serviceCount: services.length,
      services,
      roots: rootNodes,
      mostSelfTime,
      honesty:
        "OTEL span flamegraph from Tempo (wall-clock). Not a Pyroscope CPU profile — use observability_query_profiles for continuous profiling. Kill-node / celld claims stay gated separately.",
    };
  });
}

/** Demo fixture — nested MCP tool path for UI/tests without Tempo. */
export function demoSpanFlameFixtureEffect(): Effect.Effect<SpanFlamegraph> {
  const t0 = 1_700_000_000_000;
  const spans: FlatSpan[] = [
    {
      spanId: "root",
      parentSpanId: null,
      name: "http.server POST /mcp",
      serviceName: "clawql-mcp",
      startMs: t0,
      endMs: t0 + 120,
      status: "ok",
    },
    {
      spanId: "auth",
      parentSpanId: "root",
      name: "auth.validate_bearer",
      serviceName: "clawql-mcp",
      startMs: t0 + 1,
      endMs: t0 + 8,
      status: "ok",
    },
    {
      spanId: "tool",
      parentSpanId: "root",
      name: "mcp.tool.call execute",
      serviceName: "clawql-mcp",
      startMs: t0 + 8,
      endMs: t0 + 110,
      status: "ok",
    },
    {
      spanId: "gate",
      parentSpanId: "tool",
      name: "gateway.gate",
      serviceName: "clawql-mcp",
      startMs: t0 + 9,
      endMs: t0 + 14,
      status: "ok",
    },
    {
      spanId: "upstream",
      parentSpanId: "tool",
      name: "http.client GET pets.list",
      serviceName: "clawql-mcp",
      startMs: t0 + 14,
      endMs: t0 + 95,
      status: "ok",
    },
    {
      spanId: "project",
      parentSpanId: "tool",
      name: "execute.fields_project",
      serviceName: "clawql-mcp",
      startMs: t0 + 95,
      endMs: t0 + 108,
      status: "ok",
    },
  ];
  return buildSpanFlamegraphEffect("demo-mcp-execute", spans);
}
