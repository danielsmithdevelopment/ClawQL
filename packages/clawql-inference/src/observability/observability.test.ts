import { describe, expect, it } from "vitest";
import { resolveLangfuseOtlpConfig } from "./langfuse-config.js";
import {
  inferenceTracingEnabled,
  langfuseTracingEnabled,
  otelInfraTracingEnabled,
  resolveObservabilityProfile,
} from "./profile.js";

describe("observability profile", () => {
  it("defaults langfuse on when credentials exist in external profile", () => {
    expect(
      langfuseTracingEnabled({
        CLAWQL_OBSERVABILITY_PROFILE: "external",
        LANGFUSE_HOST: "https://langfuse.example",
        LANGFUSE_PUBLIC_KEY: "pk",
        LANGFUSE_SECRET_KEY: "sk",
      })
    ).toBe(true);
  });

  it("disables langfuse in minimal profile", () => {
    expect(
      langfuseTracingEnabled({
        CLAWQL_OBSERVABILITY_PROFILE: "minimal",
        LANGFUSE_HOST: "https://langfuse.example",
        LANGFUSE_PUBLIC_KEY: "pk",
        LANGFUSE_SECRET_KEY: "sk",
      })
    ).toBe(false);
  });

  it("respects CLAWQL_ENABLE_LANGFUSE=0 opt-out", () => {
    expect(
      langfuseTracingEnabled({
        CLAWQL_ENABLE_LANGFUSE: "0",
        LANGFUSE_HOST: "https://langfuse.example",
        LANGFUSE_PUBLIC_KEY: "pk",
        LANGFUSE_SECRET_KEY: "sk",
      })
    ).toBe(false);
  });

  it("requires OTEL flag and endpoint for infra tracing", () => {
    expect(
      otelInfraTracingEnabled({
        CLAWQL_ENABLE_OTEL_TRACING: "1",
        OTEL_EXPORTER_OTLP_ENDPOINT: "http://collector:4318",
      })
    ).toBe(true);
    expect(
      otelInfraTracingEnabled({
        CLAWQL_ENABLE_OTEL_TRACING: "1",
      })
    ).toBe(false);
  });

  it("enables inference tracing when either backend is active", () => {
    expect(
      inferenceTracingEnabled({
        CLAWQL_ENABLE_OTEL_TRACING: "1",
        OTEL_EXPORTER_OTLP_ENDPOINT: "http://collector:4318",
      })
    ).toBe(true);
    expect(resolveObservabilityProfile({})).toBe("external");
  });
});

describe("langfuse otlp config", () => {
  it("builds public otlp url and auth headers", () => {
    const config = resolveLangfuseOtlpConfig({
      LANGFUSE_HOST: "https://langfuse.example/",
      LANGFUSE_PUBLIC_KEY: "pk-test",
      LANGFUSE_SECRET_KEY: "sk-test",
    });
    expect(config?.url).toBe("https://langfuse.example/api/public/otel/v1/traces");
    expect(config?.headers.Authorization).toMatch(/^Basic /);
    expect(config?.headers["x-langfuse-public-key"]).toBe("pk-test");
  });
});
