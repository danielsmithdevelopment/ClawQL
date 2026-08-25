import { Effect } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createInferenceStore } from "../store/create.js";
import { buildInferenceRecord } from "../store/types.js";
import { inferenceRecordToLokiLine } from "./loki.js";

describe("inference Loki push", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("omits prompt and response bodies from the Loki line", async () => {
    const record = buildInferenceRecord({
      id: "r1",
      request: {
        messages: [{ role: "user", content: "SECRET_PROMPT" }],
        model: "mlx/ornith",
        correlationId: "corr-1",
      },
      response: { content: "SECRET_RESPONSE", model: "mlx/ornith" },
      provider: "mlx",
      model: "ornith",
      latencyMs: 12,
    });
    const line = await Effect.runPromise(inferenceRecordToLokiLine(record));
    expect(line.messageCount).toBe(1);
    expect(line.roles).toEqual(["user"]);
    expect(line.responseChars).toBe("SECRET_RESPONSE".length);
    expect(JSON.stringify(line)).not.toContain("SECRET_PROMPT");
    expect(JSON.stringify(line)).not.toContain("SECRET_RESPONSE");
  });

  it("POSTs job=clawql-inference when the store appends and URL is set", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const store = createInferenceStore({
      backend: "memory",
      env: {
        CLAWQL_LOKI_PUSH_URL: "http://127.0.0.1:9/loki/api/v1/push",
        CLAWQL_LOKI_INFERENCE_JOB: "clawql-inference-test",
      },
    });
    expect(store).not.toBeNull();
    const record = buildInferenceRecord({
      id: "r2",
      request: { messages: [{ role: "user", content: "hi" }], model: "mlx/x" },
      response: { content: "yo", model: "mlx/x" },
      provider: "mlx",
      model: "x",
      latencyMs: 3,
    });
    await store!.append(record);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(init.body as string) as {
      streams: { stream: Record<string, string>; values: string[][] }[];
    };
    expect(payload.streams[0]?.stream).toEqual({
      job: "clawql-inference-test",
      service: "clawql-inference",
    });
    const line = JSON.parse(payload.streams[0]?.values[0]?.[1] ?? "{}") as {
      kind: string;
      id: string;
    };
    expect(line.kind).toBe("inference_call");
    expect(line.id).toBe("r2");
  });

  it("does not fetch when Loki URL is unset", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const store = createInferenceStore({ backend: "memory", env: {} });
    const record = buildInferenceRecord({
      id: "r3",
      request: { messages: [{ role: "user", content: "hi" }], model: "mlx/x" },
      response: { content: "yo", model: "mlx/x" },
      provider: "mlx",
      model: "x",
      latencyMs: 3,
    });
    await store!.append(record);
    await new Promise((r) => setTimeout(r, 30));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
