import { InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { trace } from "@opentelemetry/api";
import { Effect } from "effect";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { attachActiveOtelParent, makeEffectOtelTracerLayer } from "./effect-otel-bridge.js";

describe("effect-otel-bridge", () => {
  const exporter = new InMemorySpanExporter();
  let provider: NodeTracerProvider;
  let layer: ReturnType<typeof makeEffectOtelTracerLayer>;

  beforeAll(() => {
    provider = new NodeTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    });
    // register() installs AsyncLocalStorage context manager (required for parent nesting).
    provider.register();
    layer = makeEffectOtelTracerLayer({
      OTEL_SERVICE_NAME: "clawql-test",
    } as NodeJS.ProcessEnv);
  });

  afterAll(async () => {
    await provider.shutdown();
  });

  it("makeEffectOtelTracerLayer exports Effect.withSpan via global OTEL provider", async () => {
    exporter.reset();
    await Effect.runPromise(
      Effect.succeed("ok").pipe(
        Effect.withSpan("clawql.search", { attributes: { "clawql.query": "q" } }),
        Effect.provide(layer)
      )
    );

    const spans = exporter.getFinishedSpans();
    expect(spans.some((s) => s.name === "clawql.search")).toBe(true);
    const search = spans.find((s) => s.name === "clawql.search");
    expect(search?.attributes["clawql.query"]).toBe("q");
  });

  it("attachActiveOtelParent nests Effect span under the active MCP span", async () => {
    exporter.reset();
    const tracer = trace.getTracer("io.clawql.mcp", "1.0.0");

    await new Promise<void>((resolve, reject) => {
      tracer.startActiveSpan("mcp.tool.search", (span) => {
        void Effect.runPromise(
          attachActiveOtelParent(Effect.succeed("ok").pipe(Effect.withSpan("clawql.search"))).pipe(
            Effect.provide(layer)
          )
        )
          .then(() => {
            span.end();
            resolve();
          })
          .catch(reject);
      });
    });

    const spans = exporter.getFinishedSpans();
    const parentSpan = spans.find((s) => s.name === "mcp.tool.search");
    const child = spans.find((s) => s.name === "clawql.search");
    expect(spans.map((s) => s.name).sort()).toEqual(["clawql.search", "mcp.tool.search"]);
    expect(child?.parentSpanContext?.spanId).toBe(parentSpan?.spanContext().spanId);
    expect(child?.spanContext().traceId).toBe(parentSpan?.spanContext().traceId);
  });
});
