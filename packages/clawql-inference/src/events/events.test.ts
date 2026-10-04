/**
 * /events REST façade tests (injected mcp-events handlers).
 */

import { createHmac } from "node:crypto";
import { createServer, request, type Server } from "node:http";
import { once } from "node:events";
import { Effect } from "effect";
import express from "express";
import { describe, expect, it } from "vitest";
import {
  CallbackEndpointError,
  InvalidEventError,
  InboundWebhookError,
  createMemorySubscriptionStore,
  generateWhsecSecretSync,
  handleMcpEventsJsonRpc,
  makeMcpEventsService,
  McpEventsService,
  McpEventsServiceLayer,
  verifyInboundWebhookEffect,
} from "clawql-mcp-events";
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

async function httpRaw(
  url: string,
  init: { method: string; body: Buffer; headers: Record<string, string> }
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      { method: init.method, headers: { "Content-Type": "application/json", ...init.headers } },
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
          resolve({ status: res.statusCode ?? 0, body });
        });
      }
    );
    req.on("error", reject);
    req.write(init.body);
    req.end();
  });
}

describe("createEventsRouter", () => {
  it("GET /events returns locked 8.0.0 discovery metadata", async () => {
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
      const body = res.body as {
        object: string;
        methods: string[];
        aliases: string[];
        envelope: string;
      };
      expect(body.object).toBe("clawql.events");
      expect(body.methods).toContain("GET /events/catalog");
      expect(body.methods).toContain("GET /events/stream");
      expect(body.methods).toContain("POST /events/inbound/{source}");
      expect(body.aliases).toContain("GET /events/list");
      expect(body.envelope).toMatch(/CloudEvents 1.0/);
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
        listSubscriptions: async (principal) =>
          [...subs.values()].filter((s) => s.principal === principal),
        unsubscribeById: async (id, principal) => {
          const s = subs.get(id);
          if (!s || s.principal !== principal) return { ok: false };
          subs.delete(id);
          return { ok: true };
        },
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
      const catalog = await httpJson(`${base}/events/catalog`, { headers });
      expect(catalog.status).toBe(200);
      expect((catalog.body as { object: string }).object).toBe("clawql.events.catalog");
      expect((catalog.body as { events: unknown[] }).events).toHaveLength(1);

      const aliasList = await httpJson(`${base}/events/list`, { headers });
      expect(aliasList.status).toBe(200);
      expect((aliasList.body as { object: string }).object).toBe("clawql.events.catalog");

      const sub = await httpJson(`${base}/events/subscriptions`, {
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

      const listed = await httpJson(`${base}/events/subscriptions`, { headers });
      expect(listed.status).toBe(200);
      expect((listed.body as { subscriptions: unknown[] }).subscriptions).toHaveLength(1);

      const got = await httpJson(`${base}/events/subscriptions/${subBody.id}`, { headers });
      expect(got.status).toBe(200);
      expect((got.body as { name: string }).name).toBe("notification.sent");
      expect((got.body as { url: string }).url).toBe("https://example.com/hooks/clawql");

      const deleted = await httpJson(`${base}/events/subscriptions/${subBody.id}`, {
        method: "DELETE",
        headers,
      });
      expect(deleted.status).toBe(200);
      expect((deleted.body as { ok: boolean }).ok).toBe(true);
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
      const bad = await httpJson(`${base}/events/subscriptions`, {
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
      const res = await httpJson(`http://127.0.0.1:${address.port}/events/catalog`);
      expect(res.status).toBe(503);
    } finally {
      await closeHttpServer(server);
    }
  });

  it("replays CloudEvents over SSE from Last-Event-ID", async () => {
    const records = [
      {
        seq: 1,
        event: {
          eventId: "evt_sse_1",
          name: "notification.sent",
          timestamp: "2026-10-04T00:00:00.000Z",
          data: { channel: "ops" },
        },
        cloudEvent: {
          specversion: "1.0" as const,
          id: "evt_sse_1",
          source: "clawql://events",
          type: "com.clawql.notification.sent",
          time: "2026-10-04T00:00:00.000Z",
          datacontenttype: "application/json" as const,
          data: { channel: "ops" },
        },
      },
    ];
    const app = express();
    app.use(
      createEventsRouter({
        env: { CLAWQL_ENABLE_MCP_EVENTS: "1" },
        replayStream: async (lastSeq) => records.filter((r) => r.seq > lastSeq),
        subscribeStream: async () => () => undefined,
      })
    );
    const server = createServer(app);
    server.listen(0);
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("no port");

    try {
      const frames = await new Promise<string>((resolve, reject) => {
        const req = request(
          {
            hostname: "127.0.0.1",
            port: address.port,
            path: "/events/stream",
            method: "GET",
            headers: { "Last-Event-ID": "0", Accept: "text/event-stream" },
          },
          (res) => {
            expect(res.statusCode).toBe(200);
            expect(String(res.headers["content-type"])).toContain("text/event-stream");
            let buf = "";
            res.on("data", (c) => {
              buf += c.toString("utf8");
              if (buf.includes("data:")) {
                req.destroy();
                resolve(buf);
              }
            });
          }
        );
        req.on("error", (err) => {
          if ((err as NodeJS.ErrnoException).message.includes("aborted")) return;
          reject(err);
        });
        req.end();
      });
      expect(frames).toContain("id: 1");
      expect(frames).toContain("com.clawql.notification.sent");
      expect(frames).toContain("evt_sse_1");
    } finally {
      await closeHttpServer(server);
    }
  });

  it("accepts signed inbound GitHub webhooks as untrusted stream.changed", async () => {
    const secret = "github-inbound";
    const rawBody = Buffer.from(JSON.stringify({ action: "opened" }));
    const sig = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
    const ingested: unknown[] = [];
    const app = express();
    app.use((req, res, next) => {
      if (req.path.startsWith("/events/inbound")) {
        express.raw({ type: "*/*" })(req, res, next);
        return;
      }
      express.json()(req, res, next);
    });
    app.use(
      createEventsRouter({
        env: { CLAWQL_ENABLE_MCP_EVENTS: "1", GITHUB_WEBHOOK_SECRET: secret },
        inbound: async (input) => {
          const event = await Effect.runPromise(verifyInboundWebhookEffect(input));
          ingested.push(event);
          return event;
        },
      })
    );
    const server = createServer(app);
    server.listen(0);
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("no port");

    try {
      const res = await httpRaw(`http://127.0.0.1:${address.port}/events/inbound/github`, {
        method: "POST",
        headers: { "x-hub-signature-256": sig, "x-github-delivery": "abc" },
        body: rawBody,
      });
      expect(res.status).toBe(202);
      expect((res.body as { untrusted: boolean; name: string }).untrusted).toBe(true);
      expect((res.body as { name: string }).name).toBe("stream.changed");
      expect(ingested).toHaveLength(1);
    } finally {
      await closeHttpServer(server);
    }
  });

  it("maps inbound signature failures", async () => {
    const app = express();
    app.use(express.json());
    app.use(
      createEventsRouter({
        env: { CLAWQL_ENABLE_MCP_EVENTS: "1" },
        inbound: async () => {
          throw new InboundWebhookError({ reason: "github signature mismatch", status: 401 });
        },
      })
    );
    const server = createServer(app);
    server.listen(0);
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("no port");
    try {
      const res = await httpJson(`http://127.0.0.1:${address.port}/events/inbound/github`, {
        method: "POST",
        body: "{}",
      });
      expect(res.status).toBe(401);
    } finally {
      await closeHttpServer(server);
    }
  });

  it("parity: MCP subscribe appears under /events and HTTP subscribe is on the same store", async () => {
    process.env.CLAWQL_MCP_EVENTS_ALLOW_LOCALHOST = "1";
    const store = createMemorySubscriptionStore();
    const deliveries: Record<string, unknown>[] = [];
    const webhookFetch = async (_url: string, init: RequestInit) => {
      const parsed = JSON.parse(String(init.body ?? "")) as Record<string, unknown>;
      if (parsed.type === "verification") {
        return new Response(JSON.stringify({ challenge: parsed.challenge }), { status: 200 });
      }
      deliveries.push(parsed);
      return new Response("ok", { status: 200 });
    };
    const svc = makeMcpEventsService({ store, webhookFetch });
    const layer = McpEventsServiceLayer({ store, webhookFetch });
    const secret = generateWhsecSecretSync();
    const run = <A, E>(program: Effect.Effect<A, E, McpEventsService>) =>
      Effect.runPromise(program.pipe(Effect.provide(layer)));

    const mcpSub = await run(
      handleMcpEventsJsonRpc(
        {
          jsonrpc: "2.0",
          id: 9,
          method: "events/subscribe",
          params: {
            name: "notification.sent",
            arguments: { channel: "ops" },
            delivery: { mode: "webhook", url: "http://127.0.0.1:1/mcp", secret },
          },
        },
        "vk_parity"
      )
    );
    expect("result" in mcpSub).toBe(true);
    if (!("result" in mcpSub)) throw new Error("mcp subscribe failed");
    const mcpId = (mcpSub.result as { id: string }).id;

    const app = express();
    app.use(express.json());
    app.use(
      createEventsRouter({
        env: { CLAWQL_ENABLE_MCP_EVENTS: "1", CLAWQL_MCP_EVENTS_ALLOW_LOCALHOST: "1" },
        list: async (input) => Effect.runPromise(svc.list(input)),
        subscribe: async (input) => Effect.runPromise(svc.subscribe(input)),
        unsubscribe: async (input) => Effect.runPromise(svc.unsubscribe(input)),
        getSubscription: async (id) => Effect.runPromise(svc.getSubscription(id)),
        listSubscriptions: async (principal) => Effect.runPromise(svc.listSubscriptions(principal)),
        unsubscribeById: async (id, principal) =>
          Effect.runPromise(svc.unsubscribeById(id, principal)),
      })
    );
    const server = createServer(app);
    server.listen(0);
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("no port");
    const base = `http://127.0.0.1:${address.port}`;
    const headers = { "x-clawql-principal": "vk_parity" };

    try {
      const listed = await httpJson(`${base}/events/subscriptions`, { headers });
      expect(listed.status).toBe(200);
      const ids = (listed.body as { subscriptions: Array<{ id: string }> }).subscriptions.map(
        (s) => s.id
      );
      expect(ids).toContain(mcpId);

      const created = await httpJson(`${base}/events/subscriptions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: "notification.sent",
          arguments: { channel: "ops" },
          delivery: { mode: "webhook", url: "http://127.0.0.1:1/http", secret },
        }),
      });
      expect(created.status).toBe(201);

      const catalog = await httpJson(`${base}/events/catalog`, { headers });
      const mcpList = await run(
        handleMcpEventsJsonRpc(
          { jsonrpc: "2.0", id: 10, method: "events/list", params: {} },
          "vk_parity"
        )
      );
      const httpNames = (catalog.body as { events: Array<{ name: string }> }).events.map(
        (e) => e.name
      );
      const mcpNames = (
        "result" in mcpList ? (mcpList.result as { events: Array<{ name: string }> }).events : []
      ).map((e) => e.name);
      expect(httpNames).toEqual(mcpNames);
      expect(httpNames).toHaveLength(7);

      await Effect.runPromise(
        svc.emit({
          eventId: "evt_http_parity",
          name: "notification.sent",
          timestamp: new Date().toISOString(),
          data: { channel: "ops", text: "twin-check" },
        })
      );
      expect(deliveries).toHaveLength(2);
      expect(deliveries[0]?.eventId).toBe("evt_http_parity");
      expect(deliveries[1]?.eventId).toBe("evt_http_parity");
      expect(deliveries[0]).toEqual(deliveries[1]);
    } finally {
      await closeHttpServer(server);
    }
  });
});
