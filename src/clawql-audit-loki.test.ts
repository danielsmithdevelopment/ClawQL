import { afterEach, describe, expect, it, vi } from "vitest";
import { handleAuditToolInput, resetClawqlAuditBufferForTests } from "./clawql-audit.js";
import { resetNativeProtocolPrometheusForTests } from "clawql-api";

describe("clawql-audit-loki", () => {
  const savedUrl = process.env.CLAWQL_LOKI_PUSH_URL;
  const savedEnable = process.env.CLAWQL_ENABLE_LOKI_PUSH;
  const savedToken = process.env.CLAWQL_LOKI_BEARER_TOKEN;
  const savedTenant = process.env.CLAWQL_LOKI_TENANT_ID;
  const savedJob = process.env.CLAWQL_LOKI_JOB;

  afterEach(() => {
    resetClawqlAuditBufferForTests();
    resetNativeProtocolPrometheusForTests();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();

    if (savedUrl === undefined) delete process.env.CLAWQL_LOKI_PUSH_URL;
    else process.env.CLAWQL_LOKI_PUSH_URL = savedUrl;
    if (savedEnable === undefined) delete process.env.CLAWQL_ENABLE_LOKI_PUSH;
    else process.env.CLAWQL_ENABLE_LOKI_PUSH = savedEnable;
    if (savedToken === undefined) delete process.env.CLAWQL_LOKI_BEARER_TOKEN;
    else process.env.CLAWQL_LOKI_BEARER_TOKEN = savedToken;
    if (savedTenant === undefined) delete process.env.CLAWQL_LOKI_TENANT_ID;
    else process.env.CLAWQL_LOKI_TENANT_ID = savedTenant;
    if (savedJob === undefined) delete process.env.CLAWQL_LOKI_JOB;
    else process.env.CLAWQL_LOKI_JOB = savedJob;
  });

  it("POSTs JSON to Loki push URL on append when configured", async () => {
    process.env.CLAWQL_LOKI_PUSH_URL = "http://127.0.0.1:9/loki/api/v1/push";
    process.env.CLAWQL_LOKI_BEARER_TOKEN = "test-token";
    process.env.CLAWQL_LOKI_TENANT_ID = "tenant-a";
    process.env.CLAWQL_LOKI_JOB = "clawql-test";

    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await handleAuditToolInput({
      operation: "append",
      category: "cat",
      action: "act",
      summary: "hello",
      correlationId: "corr-1",
    });

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:9/loki/api/v1/push");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer test-token");
    expect(headers["X-Scope-OrgID"]).toBe("tenant-a");

    const payload = JSON.parse(init.body as string) as {
      streams: { stream: Record<string, string>; values: string[][] }[];
    };
    expect(payload.streams).toHaveLength(1);
    expect(payload.streams[0].stream).toEqual({ job: "clawql-test", service: "clawql-mcp" });
    const line = JSON.parse(payload.streams[0].values[0][1]) as {
      category: string;
      action: string;
      summary: string;
      correlationId: string;
    };
    expect(line.category).toBe("cat");
    expect(line.action).toBe("act");
    expect(line.summary).toBe("hello");
    expect(line.correlationId).toBe("corr-1");
  });

  it("does not fetch when CLAWQL_ENABLE_LOKI_PUSH=0 even if URL is set", async () => {
    process.env.CLAWQL_LOKI_PUSH_URL = "http://127.0.0.1:9/loki/api/v1/push";
    process.env.CLAWQL_ENABLE_LOKI_PUSH = "0";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await handleAuditToolInput({
      operation: "append",
      category: "c",
      action: "a",
      summary: "s",
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not fetch when CLAWQL_LOKI_PUSH_URL is unset", async () => {
    delete process.env.CLAWQL_LOKI_PUSH_URL;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await handleAuditToolInput({
      operation: "append",
      category: "c",
      action: "a",
      summary: "s",
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
