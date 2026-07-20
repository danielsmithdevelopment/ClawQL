import { createServer, request, type Server } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createInferenceGateway } from "../gateway.js";
import { createOpenAiAdapter } from "../plugin/adapters/openai.js";
import { createUsageStore } from "clawql-payments";
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

describe("inference entitlement enforcement HTTP", () => {
  let home: string;

  afterEach(async () => {
    vi.unstubAllGlobals();
    if (home) await rm(home, { recursive: true, force: true });
  });

  it(
    "returns 402 insufficient_quota when monthly inference limit is reached",
    { timeout: 15_000 },
    async () => {
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

      home = await mkdtemp(join(tmpdir(), "clawql-inference-http-entitlements-"));
      const env = {
        CLAWQL_HOME: home,
        CLAWQL_PAYMENTS_ENFORCE_INFERENCE: "1",
      };
      await mkdir(join(home, "Payments"), { recursive: true });
      await writeFile(
        join(home, "Payments", "payments.json"),
        `${JSON.stringify({ plan: "free", tenantId: "default" }, null, 2)}\n`
      );

      const usageStore = createUsageStore(env);
      for (let i = 0; i < 100; i++) {
        await usageStore.increment("default", "inference_calls", 1, "free");
      }

      const gateway = createInferenceGateway({
        env,
        semanticCache: false,
        fallback: false,
        providers: new Map([
          [
            "openai",
            createOpenAiAdapter({ apiKey: "test-key", baseUrl: "https://api.openai.com/v1" }),
          ],
        ]),
      });
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
            model: "openai/gpt-4o",
            messages: [{ role: "user", content: "ping" }],
          }),
        });
        expect(denied.status).toBe(402);
        const body = denied.body as { error?: { type?: string; message?: string } };
        expect(body.error?.type).toBe("insufficient_quota");
        expect(body.error?.message).toContain("inference_calls limit reached");
      } finally {
        await closeHttpServer(server);
      }
    }
  );
});
