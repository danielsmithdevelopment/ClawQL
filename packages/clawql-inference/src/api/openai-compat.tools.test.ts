import { createServer, request, type Server } from "node:http";
import { once } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfiguredInferenceGateway } from "../gateway.js";
import { createOpenAiAdapter } from "../plugin/adapters/openai.js";
import { createInferenceHttpApp } from "./server.js";
import { requestUsesToolCalling } from "./openai-compat.js";

function closeHttpServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof server.closeIdleConnections === "function") {
      server.closeIdleConnections();
    }
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

async function httpJson(
  url: string,
  init?: { method?: string; body?: string; headers?: Record<string, string> }
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = { ...init?.headers };
    if (init?.body) headers["Content-Type"] = "application/json";
    const req = request(
      url,
      {
        method: init?.method ?? "GET",
        headers: Object.keys(headers).length ? headers : undefined,
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            body: data ? (JSON.parse(data) as unknown) : null,
          });
        });
      }
    );
    req.on("error", reject);
    if (init?.body) req.write(init.body);
    req.end();
  });
}

describe("requestUsesToolCalling", () => {
  it("detects tools, tool_choice, and tool messages", () => {
    expect(requestUsesToolCalling({ messages: [{ role: "user", content: "hi" }] })).toBe(false);
    expect(
      requestUsesToolCalling({
        messages: [{ role: "user", content: "hi" }],
        tools: [{ type: "function", function: { name: "read" } }],
      })
    ).toBe(true);
    expect(
      requestUsesToolCalling({
        messages: [{ role: "user", content: "hi" }],
        tool_choice: "auto",
      })
    ).toBe(true);
    expect(
      requestUsesToolCalling({
        messages: [{ role: "tool", content: "ok", tool_call_id: "c1" }],
      })
    ).toBe(true);
    expect(
      requestUsesToolCalling({
        messages: [
          {
            role: "assistant",
            content: null,
            tool_calls: [
              { id: "c1", type: "function", function: { name: "read", arguments: "{}" } },
            ],
          },
        ],
      })
    ).toBe(true);
  });
});

describe("tool calling passthrough", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("forwards tools and returns upstream tool_calls finish_reason", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: { body?: string }) => {
      const sent = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      expect(sent.tools).toEqual([
        { type: "function", function: { name: "memory_recall", parameters: { type: "object" } } },
      ]);
      expect(sent.model).toBe("gpt-4o-mini");
      expect(sent.stream).toBe(false);
      return {
        ok: true,
        json: async () => ({
          id: "chatcmpl-tools",
          object: "chat.completion",
          model: "gpt-4o-mini",
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: "call_1",
                    type: "function",
                    function: { name: "memory_recall", arguments: '{"query":"auth"}' },
                  },
                ],
              },
              finish_reason: "tool_calls",
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const openai = createOpenAiAdapter({
      apiKey: "test-key",
      baseUrl: "https://api.openai.com/v1",
    });
    const registry = new Map([["openai", openai]]);
    const gateway = new ConfiguredInferenceGateway(registry);
    const app = createInferenceHttpApp({ gateway, registry });
    const server = createServer(app);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("expected port");

    try {
      const res = await httpJson(`http://127.0.0.1:${address.port}/v1/chat/completions`, {
        method: "POST",
        body: JSON.stringify({
          model: "openai/gpt-4o-mini",
          messages: [{ role: "user", content: "recall auth decisions" }],
          tools: [
            {
              type: "function",
              function: { name: "memory_recall", parameters: { type: "object" } },
            },
          ],
          tool_choice: "auto",
        }),
      });
      expect(res.status).toBe(200);
      const body = res.body as {
        model: string;
        choices: Array<{ finish_reason: string; message: { tool_calls?: unknown[] } }>;
      };
      // OpenAI conventional public ids are bare (gpt-4o-mini), not openai/…
      expect(body.model).toBe("gpt-4o-mini");
      expect(body.choices[0]?.finish_reason).toBe("tool_calls");
      expect(body.choices[0]?.message.tool_calls?.[0]).toMatchObject({
        id: "call_1",
        function: { name: "memory_recall" },
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      await closeHttpServer(server);
    }
  });

  it("pipes streaming tool_calls deltas from upstream", async () => {
    const sse =
      'data: {"id":"chatcmpl-s","object":"chat.completion.chunk","model":"gpt-4o-mini","choices":[{"index":0,"delta":{"role":"assistant","tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"bash","arguments":""}}]},"finish_reason":null}]}\n\n' +
      'data: {"id":"chatcmpl-s","object":"chat.completion.chunk","model":"gpt-4o-mini","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"command\\":\\"ls\\"}"}}]},"finish_reason":null}]}\n\n' +
      'data: {"id":"chatcmpl-s","object":"chat.completion.chunk","model":"gpt-4o-mini","choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]}\n\n' +
      "data: [DONE]\n\n";

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(sse));
            controller.close();
          },
        }),
      }))
    );

    const openai = createOpenAiAdapter({
      apiKey: "test-key",
      baseUrl: "https://api.openai.com/v1",
    });
    const registry = new Map([["openai", openai]]);
    const gateway = new ConfiguredInferenceGateway(registry);
    const app = createInferenceHttpApp({ gateway, registry });
    const server = createServer(app);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("expected port");

    try {
      const raw = await new Promise<string>((resolve, reject) => {
        const req = request(
          `http://127.0.0.1:${address.port}/v1/chat/completions`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
          },
          (res) => {
            let data = "";
            res.on("data", (chunk) => {
              data += chunk;
            });
            res.on("end", () => resolve(data));
          }
        );
        req.on("error", reject);
        req.write(
          JSON.stringify({
            model: "openai/gpt-4o-mini",
            stream: true,
            messages: [{ role: "user", content: "list files" }],
            tools: [{ type: "function", function: { name: "bash" } }],
          })
        );
        req.end();
      });

      expect(raw).toContain('"finish_reason":"tool_calls"');
      expect(raw).toContain('"name":"bash"');
      expect(raw).toContain('"model":"gpt-4o-mini"');
      expect(raw).toContain("data: [DONE]");
    } finally {
      await closeHttpServer(server);
    }
  });
});
