/**
 * /events REST façade tests (injected mcp-events handlers).
 */

import { createServer, request, type Server } from "node:http";
import { once } from "node:events";
import express from "express";
import { describe, expect, it } from "vitest";
import { CallbackEndpointError, InvalidEventError } from "clawql-mcp-events";
import { createEventsRouter } from "./router.js";
import type { SubscribeParams, UnsubscribeParams } from "clawql-mcp-events";

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
): Promise<{
  status: number;
  body: unknown;
  headers: Record<string, string | string[] | undefined>;
}> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = { ...init?.headers };
    if (init?.body) headers["Content-Type"] = "application/json";
    const req = request(
      url,
      {
        method: init?.method ?? "GET",
        headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          let body: unknown = raw;
          try {
            body = raw ? JSON.parse(raw) : null;
          } catch {
            /* keep raw */
          }
          resolve({ status: res.statusCode ?? 0, body, headers: res.headers });
        });
      }
    );
    req.on("error", reject);
    if (init?.body) req.write(init.body);
    req.end();
  });
}

describe("createEventsRouter", () => {
  it("GET /events returns discovery metadata", async () => {
    const app = express();
    app.use(express.json());
    app.use(createEventsRouter({ env: { CLAWQL_ENABLE_MCP_EVENTS: "1" } }));
    const server = createServer(app);
    server.listen(0);
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("no port");
    try {
      const res = await httpJson(`http://127.0.0.1:${address.port}/events`);
      expect(res.status).toBe(200);
      const body = res.body as Record<string, unknown>;
      expect(body.object).toBe("clawql.events");
      expect(body.enabled).toBe(true);
    } finally {
      await closeHttpServer(server);
    }
  });

  it("lists, subscribes, unsubscribes, and gets subscription via REST", async () => {
    const subs = new Map<
      string,
      {
        id: string;
        principal: string;
        name: string;
        arguments: Record<string, unknown>;
        url: string;
        refreshBefore: string | null;
        cursor: string | null;
        verified: boolean;
        createdAt: string;
        updatedAt: string;
        secret: string;
      }
    >();

    const app = express();
    app.use(express.json());
    app.use(
      createEventsRouter({
        env: { CLAWQL_ENABLE_MCP_EVENTS: "1" },
        list: async () => ({
          events: [
            {
              name: "notification.sent",
              description: "Slack notify success",
              delivery: ["webhook"],
              inputSchema: { type: "object" },
              payloadSchema: { type: "object" },
            },
          ],
        }),
        subscribe: async (input: SubscribeParams) => {
          const id = `sub_${input.principal}_${input.name}`;
          const now = new Date().toISOString();
          subs.set(id, {
            id,
            principal: input.principal,
            name: input.name,
            arguments: input.arguments ?? {},
            url: input.delivery.url,
            refreshBefore: null,
            cursor: null,
            verified: true,
            createdAt: now,
            updatedAt: now,
            secret: input.delivery.secret ?? "whsec_test",
          });
          return { id, refreshBefore: null, cursor: null, truncated: false };
        },
        unsubscribe: async (input: UnsubscribeParams) => {
          for (const [id, s] of subs) {
            if (
              s.principal === input.principal &&
              s.name === input.name &&
              s.url === input.delivery.url
            ) {
              subs.delete(id);
            }
          }
          return {};
        },
        getSubscription: async (id) => subs.get(id),
      })
    );
    const server = createServer(app);
    server.listen(0);
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("no port");
    const base = `http://127.0.0.1:${address.port}`;
    const headers = { "x-clawql-principal": "vk_test" };

    try {
      const listed = await httpJson(`${base}/events/list`, { headers });
      expect(listed.status).toBe(200);
      expect((listed.body as { object: string }).object).toBe("clawql.events.list");
      expect((listed.body as { events: unknown[] }).events).toHaveLength(1);

      const sub = await httpJson(`${base}/events/subscribe`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: "notification.sent",
          arguments: { channel: "ops" },
          delivery: {
            mode: "webhook",
            url: "https://example.com/hooks/clawql",
            secret: "whsec_dGVzdHNlY3JldHRlc3RzZWNyZXR0ZXN0",
          },
        }),
      });
      expect(sub.status).toBe(201);
      const subBody = sub.body as { id: string; object: string };
      expect(subBody.object).toBe("clawql.events.subscription");
      expect(subBody.id).toContain("vk_test");

      const got = await httpJson(`${base}/events/subscriptions/${subBody.id}`, { headers });
      expect(got.status).toBe(200);
      expect((got.body as { name: string }).name).toBe("notification.sent");
      expect((got.body as { url: string }).url).toBe("https://example.com/hooks/clawql");

      const unsub = await httpJson(`${base}/events/unsubscribe`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: "notification.sent",
          arguments: { channel: "ops" },
          delivery: { mode: "webhook", url: "https://example.com/hooks/clawql" },
        }),
      });
      expect(unsub.status).toBe(200);
      expect((unsub.body as { ok: boolean }).ok).toBe(true);
    } finally {
      await closeHttpServer(server);
    }
  });

  it("returns 400 for missing subscribe fields and maps tagged errors", async () => {
    const app = express();
    app.use(express.json());
    app.use(
      createEventsRouter({
        env: { CLAWQL_ENABLE_MCP_EVENTS: "1" },
        subscribe: async () => {
          throw new InvalidEventError({ message: "unknown event" });
        },
        unsubscribe: async () => {
          throw new CallbackEndpointError({ message: "bad callback", reason: "ssrf_blocked" });
        },
        list: async () => ({ events: [] }),
        getSubscription: async () => undefined,
      })
    );
    const server = createServer(app);
    server.listen(0);
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("no port");
    const base = `http://127.0.0.1:${address.port}`;

    try {
      const bad = await httpJson(`${base}/events/subscribe`, {
        method: "POST",
        body: JSON.stringify({ name: "notification.sent" }),
      });
      expect(bad.status).toBe(400);

      const invalid = await httpJson(`${base}/events/subscribe`, {
        method: "POST",
        body: JSON.stringify({
          name: "nope",
          delivery: { mode: "webhook", url: "https://example.com/h" },
        }),
      });
      expect(invalid.status).toBe(400);

      const callback = await httpJson(`${base}/events/unsubscribe`, {
        method: "POST",
        body: JSON.stringify({
          name: "notification.sent",
          delivery: { mode: "webhook", url: "https://example.com/h" },
        }),
      });
      expect(callback.status).toBe(400);
      expect((callback.body as { error: { reason: string } }).error.reason).toBe("ssrf_blocked");
    } finally {
      await closeHttpServer(server);
    }
  });

  it("returns 503 when MCP Events are disabled", async () => {
    const app = express();
    app.use(express.json());
    app.use(
      createEventsRouter({
        env: { CLAWQL_ENABLE_MCP_EVENTS: "0" },
        list: async () => ({ events: [] }),
      })
    );
    const server = createServer(app);
    server.listen(0);
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("no port");
    try {
      const res = await httpJson(`http://127.0.0.1:${address.port}/events/list`);
      expect(res.status).toBe(503);
    } finally {
      await closeHttpServer(server);
    }
  });
});
