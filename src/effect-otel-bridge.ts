/**
 * Bridge Effect.withSpan to the process-wide OpenTelemetry TracerProvider.
 *
 * When {@link maybeInitOtelTracing} has registered a NodeTracerProvider, Effect spans
 * (`clawql.search` / `clawql.execute`) export via the same OTLP path as `mcp.tool.*`.
 * When OTEL is off, the global provider is a noop — Effect spans stay cheap no-ops.
 *
 * Captures `trace.getTracerProvider()` at Layer construction (call after
 * `maybeInitOtelTracing` when enabling OTLP). Avoids `Tracer.layerGlobal`, which
 * memoizes the first provider forever via a module-level Layer.sync.
 */

import { Resource, Tracer as OtelTracer } from "@effect/opentelemetry";
import { trace } from "@opentelemetry/api";
import { Effect, Layer } from "effect";

function serviceNameFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  return env.OTEL_SERVICE_NAME?.trim() || env.CLAWQL_OTEL_SERVICE_NAME?.trim() || "clawql-mcp";
}

/**
 * Effect Tracer Layer backed by the current `trace.getTracerProvider()`.
 * Merge into {@link createClawQLApi} `runtimeLayers` so ManagedRuntime runs use OTEL.
 */
export function makeEffectOtelTracerLayer(
  env: NodeJS.ProcessEnv = process.env
): Layer.Layer<never, never, never> {
  const resource = Resource.layer({ serviceName: serviceNameFromEnv(env) });
  const provider = Layer.succeed(OtelTracer.OtelTracerProvider, trace.getTracerProvider());
  return OtelTracer.layer.pipe(Layer.provide(provider), Layer.provide(resource)) as Layer.Layer<
    never,
    never,
    never
  >;
}

/**
 * Nest Effect spans under the active OpenTelemetry span (e.g. `mcp.tool.search`).
 * No-op when there is no active span / invalid context.
 */
export function attachActiveOtelParent<A, E, R>(
  effect: Effect.Effect<A, E, R>
): Effect.Effect<A, E, R> {
  const span = trace.getActiveSpan();
  if (!span) return effect;
  const ctx = span.spanContext();
  if (!ctx.traceId || ctx.traceId === "00000000000000000000000000000000") {
    return effect;
  }
  return OtelTracer.withSpanContext(ctx)(effect) as Effect.Effect<A, E, R>;
}
