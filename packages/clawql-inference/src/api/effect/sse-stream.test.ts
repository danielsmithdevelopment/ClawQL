import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { collectOpenAiCompletionChunks } from "./sse-stream.js";

describe("openAiCompletionChunkStream", () => {
  it("emits role, content, and finish chunks in order", async () => {
    async function* chunks() {
      yield "hello";
      yield " world";
    }

    const collected = await Effect.runPromise(
      collectOpenAiCompletionChunks({
        completionId: "chatcmpl-test",
        model: "gpt-test",
        created: 1_700_000_000,
        chunks: chunks(),
        usage: { inputTokens: 3, outputTokens: 2 },
      })
    );

    expect(collected).toHaveLength(4);
    expect(collected[0]?.choices[0]?.delta).toEqual({ role: "assistant" });
    expect(collected[1]?.choices[0]?.delta).toEqual({ content: "hello" });
    expect(collected[2]?.choices[0]?.delta).toEqual({ content: " world" });
    expect(collected[3]?.choices[0]?.finish_reason).toBe("stop");
    expect(collected[3]?.usage).toEqual({
      prompt_tokens: 3,
      completion_tokens: 2,
      total_tokens: 5,
    });
  });

  it("skips empty content chunks", async () => {
    async function* chunks() {
      yield "";
      yield "ok";
      yield "";
    }

    const collected = await Effect.runPromise(
      collectOpenAiCompletionChunks({
        completionId: "chatcmpl-test",
        model: "gpt-test",
        created: 1_700_000_000,
        chunks: chunks(),
      })
    );

    expect(collected).toHaveLength(3);
    expect(collected[1]?.choices[0]?.delta).toEqual({ content: "ok" });
  });
});
