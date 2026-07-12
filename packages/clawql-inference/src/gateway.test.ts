import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfiguredInferenceGateway } from "./gateway.js";
import { createOpenAiAdapter } from "./plugin/adapters/openai.js";

describe("ConfiguredInferenceGateway", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("routes openai/model ids through the openai adapter", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        model: "gpt-4o",
        choices: [{ message: { content: "hello from gateway" } }],
        usage: { prompt_tokens: 3, completion_tokens: 5 },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const gateway = new ConfiguredInferenceGateway(
      new Map([
        [
          "openai",
          createOpenAiAdapter({ apiKey: "test-key", baseUrl: "https://api.openai.com/v1" }),
        ],
      ])
    );

    const result = await gateway.complete({
      model: "openai/gpt-4o",
      messages: [{ role: "user", content: "hi" }],
      correlationId: "corr-1",
    });

    expect(result.content).toBe("hello from gateway");
    expect(result.model).toBe("gpt-4o");
    expect(result.correlationId).toBe("corr-1");
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
