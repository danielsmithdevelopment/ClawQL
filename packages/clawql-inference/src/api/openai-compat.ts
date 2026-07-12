import { randomUUID } from "node:crypto";
import express, { type Request, type Response } from "express";
import type { ChatMessage, InferenceGateway } from "../gateway.js";

type OpenAiChatCompletionRequest = {
  model?: string;
  messages?: Array<{ role?: string; content?: string }>;
  user?: string;
};

function readCorrelationId(req: Request): string | undefined {
  const header =
    req.header("x-correlation-id") ??
    req.header("x-clawql-correlation-id") ??
    req.header("correlation-id");
  return header?.trim() || undefined;
}

export function createOpenAiCompatRouter(gateway: InferenceGateway): express.Router {
  const router = express.Router();

  router.post("/v1/chat/completions", async (req: Request, res: Response) => {
    const body = req.body as OpenAiChatCompletionRequest;
    const model = body.model?.trim();
    if (!model) {
      res.status(400).json({ error: { message: "model is required" } });
      return;
    }
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      res.status(400).json({ error: { message: "messages is required" } });
      return;
    }

    const messages: ChatMessage[] = body.messages.map((message) => ({
      role: (message.role ?? "user") as ChatMessage["role"],
      content: message.content ?? "",
    }));

    try {
      const result = await gateway.complete({
        model,
        messages,
        correlationId: readCorrelationId(req),
      });
      const created = Math.floor(Date.now() / 1000);
      res.json({
        id: `chatcmpl-${randomUUID()}`,
        object: "chat.completion",
        created,
        model: result.model,
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: result.content },
            finish_reason: "stop",
          },
        ],
        usage: result.usage
          ? {
              prompt_tokens: result.usage.inputTokens,
              completion_tokens: result.usage.outputTokens,
              total_tokens: result.usage.inputTokens + result.usage.outputTokens,
            }
          : undefined,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(502).json({ error: { message } });
    }
  });

  return router;
}
