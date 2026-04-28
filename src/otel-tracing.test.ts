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
});
