/**
 * Express router for /events — same MCP Events system as JSON-RPC on /mcp.
 * Canonical 8.0.0 names: catalog, subscriptions, stream, inbound.
 * Aliases: /events/list, /events/subscribe, /events/unsubscribe.
 */

import express, { type Request, type Response } from "express";
import { Effect } from "effect";
import {
  CallbackEndpointError,
  formatSseFrameEffect,
  InboundWebhookError,
  InvalidEventError,
  isMcpEventsEnabledSync,
  parseLastEventIdEffect,
  UnauthorizedEventError,
  type DeliverableEvent,
  type EventStreamRecord,
  type InboundWebhookInput,
  type ListEventsResult,
  type PublicSubscription,
  type StoredSubscription,
  type SubscribeParams,
  type SubscribeResult,
  type UnsubscribeParams,
} from "clawql-mcp-events";
import type { VirtualKeyRequest } from "../api/auth.js";
import { sendOpenAiError } from "../api/openai-errors.js";
import {
  runEventsGatewayGetSubscription,
  runEventsGatewayInbound,
  runEventsGatewayList,
  runEventsGatewayListSubscriptions,
  runEventsGatewayReplayStream,
  runEventsGatewaySubscribe,
  runEventsGatewaySubscribeStream,
  runEventsGatewayUnsubscribe,
  runEventsGatewayUnsubscribeById,
  type EventsGatewayListInput,
} from "./service.js";

export type CreateEventsRouterOptions = {
  env?: NodeJS.ProcessEnv;
  list?: (input: EventsGatewayListInput) => Promise<ListEventsResult>;
  subscribe?: (input: SubscribeParams) => Promise<SubscribeResult>;
  unsubscribe?: (input: UnsubscribeParams) => Promise<Record<string, never>>;
  getSubscription?: (id: string) => Promise<StoredSubscription | undefined>;
  listSubscriptions?: (principal: string) => Promise<readonly PublicSubscription[]>;
  unsubscribeById?: (id: string, principal: string) => Promise<{ ok: boolean }>;
  replayStream?: (lastSeq: number, name?: string) => Promise<readonly EventStreamRecord[]>;
  subscribeStream?: (listener: (record: EventStreamRecord) => void) => Promise<() => void>;
  inbound?: (input: InboundWebhookInput) => Promise<DeliverableEvent>;
};

function principalFromReq(req: VirtualKeyRequest): string {
  if (req.virtualKey?.id) return req.virtualKey.id;
  const header = req.headers["x-clawql-principal"];
  if (typeof header === "string" && header.trim()) return header.trim();
  if (Array.isArray(header) && header[0]?.trim()) return header[0].trim();
  return "anonymous";
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function parseSubscribeBody(body: unknown, principal: string): SubscribeParams | { error: string } {
  if (!body || typeof body !== "object") return { error: "JSON body required" };
  const b = body as Record<string, unknown>;
  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name) return { error: "name is required" };
  const delivery = asRecord(b.delivery);
  const url = typeof delivery.url === "string" ? delivery.url.trim() : "";
  if (!url) return { error: "delivery.url is required" };
  if (delivery.mode !== undefined && delivery.mode !== "webhook") {
    return { error: "delivery.mode must be webhook" };
  }
  return {
    name,
    arguments: asRecord(b.arguments),
    delivery: {
      mode: "webhook",
      url,
      secret: typeof delivery.secret === "string" ? delivery.secret : undefined,
    },
    cursor: b.cursor === null ? null : typeof b.cursor === "string" ? b.cursor : undefined,
    ttlMs: b.ttlMs === null ? null : typeof b.ttlMs === "number" ? b.ttlMs : undefined,
    principal,
  };
}

function parseUnsubscribeBody(
  body: unknown,
  principal: string
): UnsubscribeParams | { error: string } {
  if (!body || typeof body !== "object") return { error: "JSON body required" };
  const b = body as Record<string, unknown>;
  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name) return { error: "name is required" };
  const delivery = asRecord(b.delivery);
  const url = typeof delivery.url === "string" ? delivery.url.trim() : "";
  if (!url) return { error: "delivery.url is required" };
  return {
    name,
    arguments: asRecord(b.arguments),
    delivery: { mode: "webhook", url },
    principal,
  };
}

function publicSubscriptionJson(sub: PublicSubscription | StoredSubscription) {
  return {
    object: "clawql.events.subscription",
    id: sub.id,
    name: sub.name,
    arguments: sub.arguments,
    url: sub.url,
    refreshBefore: sub.refreshBefore,
    cursor: sub.cursor,
    verified: sub.verified,
    createdAt: sub.createdAt,
    updatedAt: sub.updatedAt,
  };
}

function mapEventsError(res: Response, error: unknown): void {
  if (error instanceof InboundWebhookError) {
    const type =
      error.status === 401 || error.status === 404 ? "invalid_request_error" : "server_error";
    sendOpenAiError(res, error.status, error.reason, type);
    return;
  }
  if (error instanceof CallbackEndpointError) {
    res.status(400).json({
      error: {
        message: error.message,
        type: "invalid_request_error",
        code: "callback_endpoint_error",
        reason: error.reason,
      },
    });
    return;
  }
  if (error instanceof InvalidEventError) {
    sendOpenAiError(res, 400, error.message, "invalid_request_error");
    return;
  }
  if (error instanceof UnauthorizedEventError) {
    sendOpenAiError(res, 403, error.message, "permission_error");
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("CLAWQL_ENABLE_MCP_EVENTS=0")) {
    sendOpenAiError(res, 503, message, "server_error");
    return;
  }
  sendOpenAiError(res, 502, message, "server_error");
}

function requireEventsEnabled(env: NodeJS.ProcessEnv, res: Response): boolean {
  if (isMcpEventsEnabledSync(env)) return true;
  sendOpenAiError(res, 503, "MCP Events are disabled (CLAWQL_ENABLE_MCP_EVENTS=0)", "server_error");
  return false;
}

function rawBodyFromReq(req: Request): Buffer {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === "string") return Buffer.from(req.body, "utf8");
  return Buffer.alloc(0);
}

export function createEventsRouter(options: CreateEventsRouterOptions = {}): express.Router {
  const router = express.Router();
  const env = options.env ?? process.env;
  const list = options.list ?? ((input) => runEventsGatewayList(input, env));
  const subscribe = options.subscribe ?? ((input) => runEventsGatewaySubscribe(input, env));
  const unsubscribe = options.unsubscribe ?? ((input) => runEventsGatewayUnsubscribe(input, env));
  const getSubscription =
    options.getSubscription ?? ((id) => runEventsGatewayGetSubscription(id, env));
  const listSubscriptions =
    options.listSubscriptions ?? ((principal) => runEventsGatewayListSubscriptions(principal, env));
  const unsubscribeById =
    options.unsubscribeById ??
    ((id, principal) => runEventsGatewayUnsubscribeById(id, principal, env));
  const replayStream =
    options.replayStream ?? ((lastSeq, name) => runEventsGatewayReplayStream(lastSeq, name, env));
  const subscribeStream =
    options.subscribeStream ?? ((listener) => runEventsGatewaySubscribeStream(listener, env));
  const inbound = options.inbound ?? ((input) => runEventsGatewayInbound(input, env));

  router.get("/events", (_req, res) => {
    res.json({
      object: "clawql.events",
      methods: [
        "GET /events/catalog",
        "GET /events/subscriptions",
        "POST /events/subscriptions",
        "DELETE /events/subscriptions/:id",
        "GET /events/stream",
        "POST /events/inbound/{source}",
      ],
      aliases: ["GET /events/list", "POST /events/subscribe", "POST /events/unsubscribe"],
      mcp: "events/list|subscribe|unsubscribe on /mcp (JSON-RPC)",
      envelope: "CloudEvents 1.0 on /events/stream; ChatGPT MCP Events JSON on webhook deliveries",
      inbound:
        "Opt-in only: stream.changed subscribers need arguments.source=inbound:{provider}|inbound:*; payloads mark source inbound:{provider} + untrusted",
      jetstream:
        "Required for managed multi-replica (CLAWQL_EVENTS_REQUIRE_JETSTREAM); webhook queue group clawql-events-webhook",
      enabled: isMcpEventsEnabledSync(env),
      description:
        "HTTP door into clawql-mcp-events. Same catalog, subscription store, and delivery as MCP Events on /mcp. NATS JetStream is the internal backbone — never exposed to customers.",
    });
  });

  const handleCatalog = async (req: VirtualKeyRequest, res: Response) => {
    if (!requireEventsEnabled(env, res)) return;
    const cursor =
      typeof req.query.cursor === "string" && req.query.cursor.trim()
        ? req.query.cursor.trim()
        : undefined;
    try {
      const result = await list({ principal: principalFromReq(req), cursor });
      res.json({ object: "clawql.events.catalog", ...result });
    } catch (error) {
      mapEventsError(res, error);
    }
  };

  router.get("/events/catalog", handleCatalog);
  router.get("/events/list", handleCatalog);

  const handleSubscribe = async (req: VirtualKeyRequest, res: Response) => {
    if (!requireEventsEnabled(env, res)) return;
    const parsed = parseSubscribeBody(req.body, principalFromReq(req));
    if ("error" in parsed) {
      sendOpenAiError(res, 400, parsed.error, "invalid_request_error");
      return;
    }
    try {
      const result = await subscribe(parsed);
      res.status(201).json({ object: "clawql.events.subscription", ...result });
    } catch (error) {
      mapEventsError(res, error);
    }
  };

  router.post("/events/subscriptions", handleSubscribe);
  router.post("/events/subscribe", handleSubscribe);

  router.get("/events/subscriptions", async (req: VirtualKeyRequest, res: Response) => {
    if (!requireEventsEnabled(env, res)) return;
    try {
      const subscriptions = await listSubscriptions(principalFromReq(req));
      res.json({
        object: "clawql.events.subscriptions",
        subscriptions: subscriptions.map(publicSubscriptionJson),
      });
    } catch (error) {
      mapEventsError(res, error);
    }
  });

  router.get("/events/subscriptions/:id", async (req: VirtualKeyRequest, res: Response) => {
    if (!requireEventsEnabled(env, res)) return;
    const id = typeof req.params.id === "string" ? req.params.id.trim() : "";
    if (!id) {
      sendOpenAiError(res, 400, "subscription id is required", "invalid_request_error");
      return;
    }
    try {
      const sub = await getSubscription(id);
      if (!sub) {
        sendOpenAiError(res, 404, "subscription not found", "invalid_request_error");
        return;
      }
      const principal = principalFromReq(req);
      if (sub.principal !== principal && principal !== "anonymous") {
        sendOpenAiError(res, 403, "subscription belongs to another principal", "permission_error");
        return;
      }
      res.json(publicSubscriptionJson(sub));
    } catch (error) {
      mapEventsError(res, error);
    }
  });

  router.delete("/events/subscriptions/:id", async (req: VirtualKeyRequest, res: Response) => {
    if (!requireEventsEnabled(env, res)) return;
    const id = typeof req.params.id === "string" ? req.params.id.trim() : "";
    if (!id) {
      sendOpenAiError(res, 400, "subscription id is required", "invalid_request_error");
      return;
    }
    try {
      const result = await unsubscribeById(id, principalFromReq(req));
      if (!result.ok) {
        sendOpenAiError(res, 404, "subscription not found", "invalid_request_error");
        return;
      }
      res.json({ object: "clawql.events.unsubscribed", ok: true, id });
    } catch (error) {
      mapEventsError(res, error);
    }
  });

  router.post("/events/unsubscribe", async (req: VirtualKeyRequest, res: Response) => {
    if (!requireEventsEnabled(env, res)) return;
    const parsed = parseUnsubscribeBody(req.body, principalFromReq(req));
    if ("error" in parsed) {
      sendOpenAiError(res, 400, parsed.error, "invalid_request_error");
      return;
    }
    try {
      await unsubscribe(parsed);
      res.json({ object: "clawql.events.unsubscribed", ok: true });
    } catch (error) {
      mapEventsError(res, error);
    }
  });

  router.get("/events/stream", async (req: VirtualKeyRequest, res: Response) => {
    if (!requireEventsEnabled(env, res)) return;
    const lastHeader = req.get("last-event-id") ?? undefined;
    const lastQuery = typeof req.query.lastEventId === "string" ? req.query.lastEventId : undefined;
    const lastSeq = Effect.runSync(parseLastEventIdEffect(lastHeader ?? lastQuery));
    const name =
      typeof req.query.name === "string" && req.query.name.trim()
        ? req.query.name.trim()
        : undefined;
    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    if (typeof res.flushHeaders === "function") res.flushHeaders();

    let closed = false;
    let unsubscribeLive: (() => void) | undefined;
    const ping = setInterval(() => {
      if (!closed) res.write(": ping\n\n");
    }, 15_000);

    const close = () => {
      if (closed) return;
      closed = true;
      clearInterval(ping);
      unsubscribeLive?.();
      if (!res.writableEnded) res.end();
    };
    req.on("close", close);

    try {
      const replayed = await replayStream(lastSeq, name);
      for (const record of replayed) {
        if (closed) return;
        res.write(Effect.runSync(formatSseFrameEffect(record)));
      }
      unsubscribeLive = await subscribeStream((record) => {
        if (closed) return;
        if (name && record.event.name !== name) return;
        res.write(Effect.runSync(formatSseFrameEffect(record)));
      });
    } catch (error) {
      close();
      if (!res.headersSent) mapEventsError(res, error);
    }
  });

  router.post("/events/inbound/:source", async (req: Request, res: Response) => {
    if (!requireEventsEnabled(env, res)) return;
    const source = typeof req.params.source === "string" ? req.params.source : "";
    try {
      const event = await inbound({
        source,
        headers: req.headers,
        rawBody: rawBodyFromReq(req),
        env,
      });
      res.status(202).json({
        object: "clawql.events.inbound",
        accepted: true,
        eventId: event.eventId,
        name: event.name,
        topic: event.data.topic,
        source: event.data.source,
        untrusted: true,
      });
    } catch (error) {
      mapEventsError(res, error);
    }
  });

  return router;
}
