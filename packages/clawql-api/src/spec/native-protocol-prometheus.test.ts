import { createRequire } from "node:module";
import { describe, expect, it, afterEach } from "vitest";
import {
  httpMetricsEnabledForHttp,
  prometheusIncGraphqlExecute,
  prometheusRecordAuditAppend,
  prometheusSyncMergeFromMaps,
  renderPrometheusMetrics,
  resetNativeProtocolPrometheusForTests,
} from "clawql-api";

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

describe("prom-client Ready defer", () => {
  afterEach(() => {
    resetNativeProtocolPrometheusForTests();
  });

  it("mutators do not load prom-client; first scrape materialises shadow", async () => {
    const req = createRequire(import.meta.url);
    const before = Boolean(req.cache?.[req.resolve("prom-client")]);
    prometheusSyncMergeFromMaps(
      new Map([["pets", { mergedOperations: 3 }]]),
      new Map([["billing", { mergedOperations: 1 }]])
    );
    prometheusIncGraphqlExecute("pets", true);
    prometheusRecordAuditAppend(2, 0);
    const afterMutate = Boolean(req.cache?.[req.resolve("prom-client")]);
    // If another test already loaded prom-client in this worker, skip the negative assert.
    if (!before) {
      expect(afterMutate).toBe(false);
    }
    const { body, contentType } = await renderPrometheusMetrics();
    expect(contentType).toMatch(/text\/plain/);
    expect(body).toContain("clawql_native_protocol_graphql_merge_operations");
    expect(body).toContain('source="pets"');
    expect(body).toContain("clawql_native_protocol_graphql_execute_total");
    expect(body).toContain("clawql_audit_append_total");
    expect(Boolean(req.cache?.[req.resolve("prom-client")])).toBe(true);
  });
});
