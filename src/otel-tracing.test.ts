import { trace, SpanStatusCode } from "@opentelemetry/api";
import { describe, expect, it, vi } from "vitest";
import {
  maybeInitOtelTracing,
  otelTracingFeatureEnabled,
  wrapMcpToolHandler,
} from "./otel-tracing.js";

describe("otel-tracing", () => {
  it("otelTracingFeatureEnabled follows CLAWQL_ENABLE_OTEL_TRACING", () => {
    vi.stubEnv("CLAWQL_ENABLE_OTEL_TRACING", undefined);
    expect(otelTracingFeatureEnabled()).toBe(false);
    vi.stubEnv("CLAWQL_ENABLE_OTEL_TRACING", "1");
    expect(otelTracingFeatureEnabled()).toBe(true);
    vi.stubEnv("CLAWQL_ENABLE_OTEL_TRACING", "0");
    expect(otelTracingFeatureEnabled()).toBe(false);
    vi.unstubAllEnvs();
  });

  it("wrapMcpToolHandler returns same handler when tracing feature is off", async () => {
    vi.stubEnv("CLAWQL_ENABLE_OTEL_TRACING", undefined);
    const inner = vi.fn(async () => ({ ok: true }));
    const wrapped = wrapMcpToolHandler("test_tool", inner);
    await wrapped({ x: 1 });
    expect(inner).toHaveBeenCalledOnce();
    vi.unstubAllEnvs();
  });

  it("maybeInitOtelTracing skips when flag off", async () => {
    vi.stubEnv("CLAWQL_ENABLE_OTEL_TRACING", undefined);
    vi.stubEnv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4318/v1/traces");
    await expect(maybeInitOtelTracing()).resolves.toBeUndefined();
    vi.unstubAllEnvs();
  });

  it("maybeInitOtelTracing skips when endpoint missing", async () => {
    vi.stubEnv("CLAWQL_ENABLE_OTEL_TRACING", "1");
    vi.stubEnv("OTEL_EXPORTER_OTLP_ENDPOINT", "");
    vi.stubEnv("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT", "");
    await expect(maybeInitOtelTracing()).resolves.toBeUndefined();
    vi.unstubAllEnvs();
  });

  it("wrapMcpToolHandler uses active span when tracing enabled", async () => {
    vi.stubEnv("CLAWQL_ENABLE_OTEL_TRACING", "1");
    const end = vi.fn();
    const setAttribute = vi.fn();
    const mockSpan = {
      end,
      setAttribute,
      setStatus: vi.fn(),
      recordException: vi.fn(),
    };
    const startActiveSpan = vi.fn(
      (_name: string, fn: (span: typeof mockSpan) => Promise<unknown>) => fn(mockSpan as never)
    );
    const getTracerSpy = vi.spyOn(trace, "getTracer").mockReturnValue({
      startActiveSpan,
    } as ReturnType<typeof trace.getTracer>);

    const inner = vi.fn(async () => ({ ok: true }));
    const wrapped = wrapMcpToolHandler("execute", inner);
    const out = await wrapped({ x: 1 } as never);

    expect(out).toEqual({ ok: true });
    expect(inner).toHaveBeenCalledOnce();
    expect(getTracerSpy).toHaveBeenCalledWith("io.clawql.mcp", "1.0.0");
    expect(startActiveSpan).toHaveBeenCalledWith("mcp.tool.execute", expect.any(Function));
    expect(setAttribute).toHaveBeenCalledWith("clawql.mcp.tool", "execute");
    expect(end).toHaveBeenCalledOnce();

    vi.unstubAllEnvs();
    getTracerSpy.mockRestore();
  });

  it("wrapMcpToolHandler marks span error when inner throws", async () => {
    vi.stubEnv("CLAWQL_ENABLE_OTEL_TRACING", "1");
    const end = vi.fn();
    const setStatus = vi.fn();
    const recordException = vi.fn();
    const mockSpan = {
      end,
      setAttribute: vi.fn(),
      setStatus,
      recordException,
    };
    vi.spyOn(trace, "getTracer").mockReturnValue({
      startActiveSpan: (_name: string, fn: (span: typeof mockSpan) => Promise<unknown>) =>
        fn(mockSpan as never),
    } as ReturnType<typeof trace.getTracer>);

    const err = new Error("boom");
    const inner = vi.fn(async () => {
      throw err;
    });
    const wrapped = wrapMcpToolHandler("search", inner);
    await expect(wrapped()).rejects.toThrow("boom");

    expect(setStatus).toHaveBeenCalledWith({
      code: SpanStatusCode.ERROR,
      message: "boom",
    });
    expect(recordException).toHaveBeenCalledWith(err);
    expect(end).toHaveBeenCalledOnce();

    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });
});
