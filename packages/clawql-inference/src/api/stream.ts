import { randomUUID } from "node:crypto";
import { Effect, Stream } from "effect";
import type { Response } from "express";
import type { InferenceResponse } from "../gateway.js";
import {
  openAiCompletionChunkStream,
  type OpenAiCompletionStreamInput,
} from "./effect/sse-stream.js";

export function writeSse(res: Response, payload: unknown): void {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

export function openAiStreamHeaders(res: Response, correlationId?: string): void {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  if (correlationId) res.setHeader("X-Correlation-Id", correlationId);
}

/** Write OpenAI-compatible SSE chunks to an Express response via Effect.Stream. */
export function streamCompletionAsOpenAiSseEffect(
  res: Response,
  input: OpenAiCompletionStreamInput & { correlationId?: string }
): Effect.Effect<void, unknown> {
  return Effect.gen(function* () {
    yield* Effect.sync(() => openAiStreamHeaders(res, input.correlationId));
    yield* Stream.runForEach(openAiCompletionChunkStream(input), (chunk) =>
      Effect.sync(() => writeSse(res, chunk))
    );
    yield* Effect.sync(() => {
      res.write("data: [DONE]\n\n");
      res.end();
    });
  });
}

export async function streamCompletionAsOpenAiSse(
  res: Response,
  input: OpenAiCompletionStreamInput & { correlationId?: string }
): Promise<void> {
  return Effect.runPromise(streamCompletionAsOpenAiSseEffect(res, input));
}

export function streamBufferedCompletion(
  res: Response,
  input: {
    model: string;
    correlationId?: string;
    result: InferenceResponse;
  }
): Promise<void> {
  const completionId = `chatcmpl-${randomUUID()}`;
  const created = Math.floor(Date.now() / 1000);
  async function* chunks(): AsyncIterable<string> {
    if (input.result.content) yield input.result.content;
  }
  return streamCompletionAsOpenAiSse(res, {
    completionId,
    model: input.model,
    created,
    correlationId: input.correlationId,
    chunks: chunks(),
    usage: input.result.usage,
  });
}

export { openAiCompletionChunkStream, collectOpenAiCompletionChunks } from "./effect/sse-stream.js";
