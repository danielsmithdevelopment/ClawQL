import { Effect } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readLokiPushConfig } from "./config.js";
import { LokiLogPush, forkPushLokiLogLine, lokiLogPushLiveLayer } from "./push.js";

describe("LokiLogPush", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("no-ops when URL is unset", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const env: NodeJS.ProcessEnv = {};
    await Effect.runPromise(
      Effect.gen(function* () {
        const loki = yield* LokiLogPush;
        yield* loki.push({
          job: "clawql-audit",
          service: "clawql-mcp",
          line: JSON.stringify({ hello: true }),
        });
      }).pipe(Effect.provide(lokiLogPushLiveLayer(env)))
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("POSTs a single stream when URL is set", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const env: NodeJS.ProcessEnv = {
      CLAWQL_LOKI_PUSH_URL: "http://127.0.0.1:9/loki/api/v1/push",
      CLAWQL_LOKI_BEARER_TOKEN: "tok",
      CLAWQL_LOKI_TENANT_ID: "tenant-a",
    };
    await Effect.runPromise(
      Effect.gen(function* () {
        const loki = yield* LokiLogPush;
        yield* loki.push({
          job: "clawql-inference",
          service: "clawql-inference",
          ts: "2026-08-23T00:00:00.000Z",
          line: JSON.stringify({ kind: "inference_call", id: "r1" }),
        });
      }).pipe(Effect.provide(lokiLogPushLiveLayer(env)))
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:9/loki/api/v1/push");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer tok");
    expect(headers["X-Scope-OrgID"]).toBe("tenant-a");
    const payload = JSON.parse(init.body as string) as {
      streams: { stream: Record<string, string>; values: string[][] }[];
    };
    expect(payload.streams[0]?.stream).toEqual({
      job: "clawql-inference",
      service: "clawql-inference",
    });
    expect(JSON.parse(payload.streams[0]?.values[0]?.[1] ?? "{}")).toEqual({
      kind: "inference_call",
      id: "r1",
    });
  });

  it("readLokiPushConfig treats CLAWQL_ENABLE_LOKI_PUSH=0 as disabled", async () => {
    const cfg = await Effect.runPromise(
      readLokiPushConfig({
        CLAWQL_LOKI_PUSH_URL: "http://127.0.0.1:9/loki/api/v1/push",
        CLAWQL_ENABLE_LOKI_PUSH: "0",
      })
    );
    expect(cfg.enabled).toBe(false);
  });

  it("forkPushLokiLogLine invokes fetch without throwing", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    forkPushLokiLogLine(
      { job: "j", service: "s", line: "{}" },
      { CLAWQL_LOKI_PUSH_URL: "http://127.0.0.1:9/loki/api/v1/push" }
    );
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });
});
