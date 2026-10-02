import { describe, expect, it, afterEach } from "vitest";
import { httpMetricsEnabledForHttp } from "clawql-api";

describe("httpMetricsEnabledForHttp", () => {
  const saved = process.env.CLAWQL_ENABLE_HTTP_METRICS;

  afterEach(() => {
    if (saved === undefined) delete process.env.CLAWQL_ENABLE_HTTP_METRICS;
    else process.env.CLAWQL_ENABLE_HTTP_METRICS = saved;
  });

  it("is true when env unset (default on)", () => {
    delete process.env.CLAWQL_ENABLE_HTTP_METRICS;
    expect(httpMetricsEnabledForHttp()).toBe(true);
  });

  it("is false when CLAWQL_ENABLE_HTTP_METRICS=0", () => {
    process.env.CLAWQL_ENABLE_HTTP_METRICS = "0";
    expect(httpMetricsEnabledForHttp()).toBe(false);
  });

  it("is true when CLAWQL_ENABLE_HTTP_METRICS=1", () => {
    process.env.CLAWQL_ENABLE_HTTP_METRICS = "1";
    expect(httpMetricsEnabledForHttp()).toBe(true);
  });
});
