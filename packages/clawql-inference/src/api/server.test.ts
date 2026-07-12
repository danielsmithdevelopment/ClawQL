import { createServer, request, type Server } from "node:http";
import { once } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfiguredInferenceGateway } from "../gateway.js";
import { createOpenAiAdapter } from "../plugin/adapters/openai.js";
import { createInferenceHttpApp } from "./server.js";

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
  init?: { method?: string; body?: string }
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        method: init?.method ?? "GET",
        headers: init?.body ? { "Content-Type": "application/json" } : undefined,
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

describe("createInferenceHttpApp", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("serves healthz and OpenAI-compatible chat completions", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          model: "gpt-4o",
          choices: [{ message: { content: "pong" } }],
          usage: { prompt_tokens: 1, completion_tokens: 1 },
        }),
      }))
    );

    const gateway = new ConfiguredInferenceGateway(
      new Map([
        [
          "openai",
          createOpenAiAdapter({ apiKey: "test-key", baseUrl: "https://api.openai.com/v1" }),
        ],
      ])
    );
    const app = createInferenceHttpApp({ gateway });
    const server = createServer(app);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("expected bound TCP port");
    }

    try {
      const health = await httpJson(`http://127.0.0.1:${address.port}/healthz`);
      expect(health.status).toBe(200);
      expect(health.body).toEqual({ status: "ok", service: "clawql-inference" });

      const completion = await httpJson(`http://127.0.0.1:${address.port}/v1/chat/completions`, {
        method: "POST",
        body: JSON.stringify({
          model: "openai/gpt-4o",
          messages: [{ role: "user", content: "ping" }],
        }),
      });
      expect(completion.status).toBe(200);
      const body = completion.body as {
        choices: Array<{ message: { content: string } }>;
      };
      expect(body.choices[0]?.message.content).toBe("pong");
    } finally {
      await closeHttpServer(server);
    }
  });
});
