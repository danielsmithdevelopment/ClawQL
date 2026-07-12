import { describe, expect, it } from "vitest";
import { InMemoryInferenceStore } from "./in-memory.js";
import { buildInferenceRecord } from "./types.js";

describe("InMemoryInferenceStore", () => {
  it("lists, traces, and rolls up spend", async () => {
    const store = new InMemoryInferenceStore();
    const record = buildInferenceRecord({
      id: "r1",
      request: {
        messages: [{ role: "user", content: "hi" }],
        model: "openai/gpt-4o",
        correlationId: "corr-1",
      },
      response: {
        content: "hello",
        model: "openai/gpt-4o",
        usage: { inputTokens: 1, outputTokens: 2 },
      },
      provider: "openai",
      model: "gpt-4o",
      latencyMs: 42,
    });
    await store.append(record);

    expect((await store.list({ limit: 10 })).length).toBe(1);
    expect((await store.getByCorrelationId("corr-1")).length).toBe(1);
    const spend = await store.spendRollup({ groupBy: "model" });
    expect(spend[0]?.calls).toBe(1);
    expect(spend[0]?.inputTokens).toBe(1);
  });
});
