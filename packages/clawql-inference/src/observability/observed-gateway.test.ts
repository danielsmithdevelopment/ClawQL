import { describe, expect, it, vi } from "vitest";
import { ConfiguredInferenceGateway } from "../gateway.js";
import { createOpenAiAdapter } from "../plugin/adapters/openai.js";
import { ObservedInferenceGateway } from "./observed-gateway.js";
import { InMemoryInferenceStore } from "../store/in-memory.js";

describe("ObservedInferenceGateway", () => {
  it("appends a record after successful completion", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          model: "gpt-4o",
          choices: [{ message: { content: "logged" } }],
          usage: { prompt_tokens: 2, completion_tokens: 3 },
        }),
      }))
    );

    const inner = new ConfiguredInferenceGateway(
      new Map([
        ["openai", createOpenAiAdapter({ apiKey: "k", baseUrl: "https://api.openai.com/v1" })],
      ])
    );
    const store = new InMemoryInferenceStore();
    const gateway = new ObservedInferenceGateway(inner, store);
    await gateway.complete({
      model: "openai/gpt-4o",
      messages: [{ role: "user", content: "hi" }],
      correlationId: "seed_abc_gen_2",
    });

    const records = store.snapshot();
    expect(records).toHaveLength(1);
    expect(records[0]?.correlationId).toBe("seed_abc_gen_2");
    expect(records[0]?.response).toBe("logged");
    vi.unstubAllGlobals();
  });
});
