import { Chunk, Effect, Stream } from "effect";
import type { InferenceResponse } from "../../gateway.js";

export type OpenAiSseChunk = {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: Record<string, unknown>;
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export type OpenAiCompletionStreamInput = {
  completionId: string;
  model: string;
  created: number;
  chunks: AsyncIterable<string>;
  usage?: InferenceResponse["usage"];
};

function chunkMeta(input: OpenAiCompletionStreamInput) {
  return {
    id: input.completionId,
    object: "chat.completion.chunk" as const,
    created: input.created,
    model: input.model,
  };
}

function toOpenAiUsage(usage?: InferenceResponse["usage"]) {
  if (!usage) return undefined;
  return {
    prompt_tokens: usage.inputTokens,
    completion_tokens: usage.outputTokens,
    total_tokens: usage.inputTokens + usage.outputTokens,
  };
}

/** Build OpenAI-compatible SSE chunk stream from token chunks. */
export function openAiCompletionChunkStream(
  input: OpenAiCompletionStreamInput
): Stream.Stream<OpenAiSseChunk> {
  const meta = chunkMeta(input);
  const start = Stream.succeed({
    ...meta,
    choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }],
  });

  const content = Stream.fromAsyncIterable(input.chunks, (cause) => cause).pipe(
    Stream.filter((text): text is string => Boolean(text)),
    Stream.map((text) => ({
      ...meta,
      choices: [{ index: 0, delta: { content: text }, finish_reason: null }],
    }))
  );

  const finish = Stream.succeed({
    ...meta,
    choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
    usage: toOpenAiUsage(input.usage),
  });

  return Stream.concat(start, Stream.concat(content, finish));
}

/** Collect OpenAI SSE chunks via Effect.Stream (for tests and non-HTTP callers). */
export function collectOpenAiCompletionChunks(
  input: OpenAiCompletionStreamInput
): Effect.Effect<readonly OpenAiSseChunk[], unknown> {
  return Stream.runCollect(openAiCompletionChunkStream(input)).pipe(
    Effect.map(Chunk.toReadonlyArray)
  );
}
