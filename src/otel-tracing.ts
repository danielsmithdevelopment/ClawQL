/**
 * Optional OTLP trace export for MCP tool spans (GitHub #160).
 *
 * Enable with **`CLAWQL_ENABLE_OTEL_TRACING=1`** and set **`OTEL_EXPORTER_OTLP_ENDPOINT`** or
 * **`OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`** (Jaeger OTLP ingest or collector). Uses dynamic imports so
 * OpenTelemetry packages load only when enabled.
 */

import { trace, SpanStatusCode, type Span } from "@opentelemetry/api";

function envTruthy(v: string | undefined): boolean {
  if (v === undefined) return false;
  const t = v.trim().toLowerCase();
  return t === "1" || t === "true" || t === "yes";
}

/** Feature gate — handlers wrap only when this is true (cheap branch before MCP calls). */
export function otelTracingFeatureEnabled(): boolean {
  return envTruthy(process.env.CLAWQL_ENABLE_OTEL_TRACING);
}

function hasOtlpEndpointConfigured(): boolean {
  const traces = process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT?.trim();
  const root = process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim();
  return Boolean(traces || root);
}

export type OtelShutdownFn = () => Promise<void>;

/**
 * Registers a **`NodeTracerProvider`** + OTLP HTTP exporter when the feature flag and an OTLP endpoint are set.
 * Safe to call multiple times — initializes at most once.
 */
export async function maybeInitOtelTracing(): Promise<OtelShutdownFn | undefined> {
  if (!otelTracingFeatureEnabled()) return undefined;
  if (!hasOtlpEndpointConfigured()) {
    console.error(
      "[clawql] CLAWQL_ENABLE_OTEL_TRACING is set but neither OTEL_EXPORTER_OTLP_TRACES_ENDPOINT nor " +
        "OTEL_EXPORTER_OTLP_ENDPOINT is set — OTLP tracing not started."
    );
    return undefined;
  }

  const { NodeTracerProvider } = await import("@opentelemetry/sdk-trace-node");
  const { BatchSpanProcessor } = await import("@opentelemetry/sdk-trace-base");
  const { OTLPTraceExporter } = await import("@opentelemetry/exporter-trace-otlp-http");
  const { Resource } = await import("@opentelemetry/resources");

  const serviceName =
    process.env.OTEL_SERVICE_NAME?.trim() ||
    process.env.CLAWQL_OTEL_SERVICE_NAME?.trim() ||
    "clawql-mcp";

  const exporter = new OTLPTraceExporter();
  const processor = new BatchSpanProcessor(exporter);
  const resource = Resource.default().merge(
    new Resource({
      "service.name": serviceName,
    })
  );

  const provider = new NodeTracerProvider({
    spanProcessors: [processor],
    resource,
  });
  provider.register();

  const shutdown = async (): Promise<void> => {
    await provider.shutdown();
  };

  const once = (): void => {
    void shutdown().catch(() => {});
  };
  process.once("SIGTERM", once);
  process.once("SIGINT", once);

  console.error(`[clawql] OTLP tracing enabled (service.name=${serviceName}).`);
  return shutdown;
}

/**
 * Wrap an MCP tool handler with **`mcp.tool.<name>`** spans when **`CLAWQL_ENABLE_OTEL_TRACING`** is on.
 * No overhead when the flag is off (same function reference returned).
 */
export function wrapMcpToolHandler<TArgs extends unknown[], TResult>(
  toolName: string,
  handler: (...args: TArgs) => Promise<TResult>
): (...args: TArgs) => Promise<TResult> {
  if (!otelTracingFeatureEnabled()) return handler;

  return async (...args: TArgs): Promise<TResult> => {
    const tracer = trace.getTracer("io.clawql.mcp", "1.0.0");
    return tracer.startActiveSpan(`mcp.tool.${toolName}`, async (span: Span) => {
      span.setAttribute("clawql.mcp.tool", toolName);
      try {
        return await handler(...args);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        span.setStatus({ code: SpanStatusCode.ERROR, message: msg });
        if (err instanceof Error) {
          span.recordException(err);
        } else {
          span.recordException(new Error(msg));
        }
        throw err;
      } finally {
        span.end();
      }
    });
  };
}
