import { trace, SpanStatusCode, type Span } from "@opentelemetry/api";
import {
  inferenceTracingEnabled,
  langfuseTracingEnabled,
  otelInfraTracingEnabled,
} from "./profile.js";
import { resolveLangfuseOtlpConfig } from "./langfuse-config.js";

export type InferenceOtelShutdownFn = () => Promise<void>;

let initPromise: Promise<InferenceOtelShutdownFn | undefined> | null = null;

/**
 * Registers NodeTracerProvider with infra OTLP and/or Langfuse OTLP exporters.
 * Dynamic imports keep OTEL packages off the critical path when tracing is disabled.
 */
export async function maybeInitInferenceOtelTracing(
  env: NodeJS.ProcessEnv = process.env
): Promise<InferenceOtelShutdownFn | undefined> {
  if (!inferenceTracingEnabled(env)) return undefined;
  if (!initPromise) {
    initPromise = initInferenceOtelTracing(env);
  }
  return initPromise;
}

async function initInferenceOtelTracing(
  env: NodeJS.ProcessEnv
): Promise<InferenceOtelShutdownFn | undefined> {
  const { NodeTracerProvider } = await import("@opentelemetry/sdk-trace-node");
  const { BatchSpanProcessor } = await import("@opentelemetry/sdk-trace-base");
  const { OTLPTraceExporter } = await import("@opentelemetry/exporter-trace-otlp-http");
  const { defaultResource, resourceFromAttributes } = await import("@opentelemetry/resources");

  const processors = [];

  if (otelInfraTracingEnabled(env)) {
    processors.push(new BatchSpanProcessor(new OTLPTraceExporter()));
  }

  const langfuse = langfuseTracingEnabled(env) ? resolveLangfuseOtlpConfig(env) : null;
  if (langfuse) {
    processors.push(
      new BatchSpanProcessor(
        new OTLPTraceExporter({
          url: langfuse.url,
          headers: langfuse.headers,
        })
      )
    );
  }

  if (processors.length === 0) return undefined;

  const serviceName =
    env.OTEL_SERVICE_NAME?.trim() ||
    env.CLAWQL_INFERENCE_OTEL_SERVICE_NAME?.trim() ||
    "clawql-inference";

  const resource = defaultResource().merge(
    resourceFromAttributes({
      "service.name": serviceName,
      "clawql.component": "inference-gateway",
    })
  );

  const provider = new NodeTracerProvider({
    spanProcessors: processors,
    resource,
  });
  provider.register();

  const targets = [otelInfraTracingEnabled(env) ? "infra-otlp" : null, langfuse ? "langfuse" : null]
    .filter(Boolean)
    .join("+");
  console.log(`[clawql-inference] OTLP tracing enabled (${targets}, service.name=${serviceName})`);

  const shutdown = async (): Promise<void> => {
    await provider.shutdown();
    initPromise = null;
  };

  const once = (): void => {
    void shutdown().catch(() => {});
  };
  process.once("SIGTERM", once);
  process.once("SIGINT", once);

  return shutdown;
}

export function inferenceTracingFeatureEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return inferenceTracingEnabled(env);
}

/** Wrap gateway completion with gen_ai / clawql span attributes. */
export function withInferenceSpan<T>(
  name: string,
  attributes: Record<string, string | number | boolean | undefined>,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  if (!inferenceTracingFeatureEnabled()) {
    return fn({
      setAttribute: () => {},
      setStatus: () => {},
      recordException: () => {},
      end: () => {},
    } as unknown as Span);
  }

  const tracer = trace.getTracer("io.clawql.inference", "1.0.0");
  return tracer.startActiveSpan(name, async (span: Span) => {
    for (const [key, value] of Object.entries(attributes)) {
      if (value !== undefined) span.setAttribute(key, value);
    }
    try {
      return await fn(span);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      span.setStatus({ code: SpanStatusCode.ERROR, message });
      if (error instanceof Error) span.recordException(error);
      else span.recordException(new Error(message));
      throw error;
    } finally {
      span.end();
    }
  });
}
