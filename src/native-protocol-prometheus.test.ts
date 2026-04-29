import { afterEach, describe, expect, it } from "vitest";
import { prometheusDisabledForHttp } from "./native-protocol-prometheus.js";

describe("native-protocol-prometheus (HTTP metrics gate)", () => {
  const saved = process.env.CLAWQL_DISABLE_HTTP_METRICS;

  afterEach(() => {
    if (saved === undefined) delete process.env.CLAWQL_DISABLE_HTTP_METRICS;
    else process.env.CLAWQL_DISABLE_HTTP_METRICS = saved;
  });

  it("prometheusDisabledForHttp is false when env unset", () => {
    delete process.env.CLAWQL_DISABLE_HTTP_METRICS;
    expect(prometheusDisabledForHttp()).toBe(false);
  });

  it("prometheusDisabledForHttp is true when CLAWQL_DISABLE_HTTP_METRICS=1", () => {
    process.env.CLAWQL_DISABLE_HTTP_METRICS = "1";
    expect(prometheusDisabledForHttp()).toBe(true);
  });

  it("prometheusDisabledForHttp is false when CLAWQL_DISABLE_HTTP_METRICS=0", () => {
    process.env.CLAWQL_DISABLE_HTTP_METRICS = "0";
    expect(prometheusDisabledForHttp()).toBe(false);
  });
});
