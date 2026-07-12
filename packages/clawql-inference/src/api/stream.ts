import { randomUUID } from "node:crypto";
import type { Response } from "express";
import type { InferenceResponse } from "../gateway.js";

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

export async function streamCompletionAsOpenAiSse(
  res: Response,
  input: {
    completionId: string;
    model: string;
    created: number;
    correlationId?: string;
    chunks: AsyncIterable<string>;
    usage?: InferenceResponse["usage"];
  }
): Promise<void> {
  openAiStreamHeaders(res, input.correlationId);
  writeSse(res, {
    id: input.completionId,
    object: "chat.completion.chunk",
    created: input.created,
    model: input.model,
    choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }],
  });

  for await (const text of input.chunks) {
    if (!text) continue;
    writeSse(res, {
      id: input.completionId,
      object: "chat.completion.chunk",
      created: input.created,
      model: input.model,
      choices: [{ index: 0, delta: { content: text }, finish_reason: null }],
    });
  }

  const usage = input.usage
    ? {
        prompt_tokens: input.usage.inputTokens,
        completion_tokens: input.usage.outputTokens,
        total_tokens: input.usage.inputTokens + input.usage.outputTokens,
      }
    : undefined;

  writeSse(res, {
    id: input.completionId,
    object: "chat.completion.chunk",
    created: input.created,
    model: input.model,
    choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
    usage,
  });
  res.write("data: [DONE]\n\n");
  res.end();
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
