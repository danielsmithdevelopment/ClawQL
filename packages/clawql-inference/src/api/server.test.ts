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

      const models = await httpJson(`http://127.0.0.1:${address.port}/v1/models`);
      expect(models.status).toBe(200);
      const modelList = models.body as { data: Array<{ id: string }> };
      expect(modelList.data.length).toBeGreaterThan(0);

      const bare = await httpJson(`http://127.0.0.1:${address.port}/v1/chat/completions`, {
        method: "POST",
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [{ role: "user", content: "ping" }],
        }),
      });
      expect(bare.status).toBe(200);

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

  it("requires virtual key when keys enforcement is active", async () => {
    const { mkdtemp } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { createVirtualKey } = await import("../keys/store.js");

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

    const dir = await mkdtemp(join(tmpdir(), "clawql-auth-"));
    const env = { CLAWQL_HOME: dir, CLAWQL_INFERENCE_KEYS_ENABLED: "1" };
    const created = await createVirtualKey({ team: "eng" }, env);

    const gateway = new ConfiguredInferenceGateway(
      new Map([
        [
          "openai",
          createOpenAiAdapter({ apiKey: "test-key", baseUrl: "https://api.openai.com/v1" }),
        ],
      ])
    );
    const app = createInferenceHttpApp({ gateway, env });
    const server = createServer(app);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("expected bound TCP port");
    }

    try {
      const denied = await httpJson(`http://127.0.0.1:${address.port}/v1/chat/completions`, {
        method: "POST",
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [{ role: "user", content: "ping" }],
        }),
      });
      expect(denied.status).toBe(401);

      const allowed = await httpJson(`http://127.0.0.1:${address.port}/v1/chat/completions`, {
        method: "POST",
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [{ role: "user", content: "ping" }],
        }),
        headers: { Authorization: `Bearer ${created.secret}` },
      });
      expect(allowed.status).toBe(200);
    } finally {
      await closeHttpServer(server);
    }
  });
});
