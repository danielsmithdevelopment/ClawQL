/**
 * Express router for /events REST façade over clawql-mcp-events.
 * Thin host boundary — MCP JSON-RPC events/* remains on /mcp.
 */

import express, { type Response } from "express";
import {
  CallbackEndpointError,
  InvalidEventError,
  isMcpEventsEnabledSync,
  UnauthorizedEventError,
  type ListEventsResult,
  type StoredSubscription,
  type SubscribeParams,
  type SubscribeResult,
  type UnsubscribeParams,
} from "clawql-mcp-events";
import type { VirtualKeyRequest } from "../api/auth.js";
import { sendOpenAiError } from "../api/openai-errors.js";
import {
  runEventsGatewayGetSubscription,
  runEventsGatewayList,
  runEventsGatewaySubscribe,
  runEventsGatewayUnsubscribe,
  type EventsGatewayListInput,
} from "./service.js";

export type CreateEventsRouterOptions = {
  env?: NodeJS.ProcessEnv;
  list?: (input: EventsGatewayListInput) => Promise<ListEventsResult>;
  subscribe?: (input: SubscribeParams) => Promise<SubscribeResult>;
  unsubscribe?: (input: UnsubscribeParams) => Promise<Record<string, never>>;
  getSubscription?: (id: string) => Promise<StoredSubscription | undefined>;
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

function mapEventsError(res: Response, error: unknown): void {
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

export function createEventsRouter(options: CreateEventsRouterOptions = {}): express.Router {
  const router = express.Router();
  const env = options.env ?? process.env;
  const list = options.list ?? ((input) => runEventsGatewayList(input, env));
  const subscribe = options.subscribe ?? ((input) => runEventsGatewaySubscribe(input, env));
  const unsubscribe = options.unsubscribe ?? ((input) => runEventsGatewayUnsubscribe(input, env));
  const getSubscription =
    options.getSubscription ?? ((id) => runEventsGatewayGetSubscription(id, env));

  router.get("/events", (_req, res) => {
    res.json({
      object: "clawql.events",
      methods: ["GET /events/list", "POST /events/subscribe", "POST /events/unsubscribe"],
      mcp: "events/list|subscribe|unsubscribe on /mcp (JSON-RPC)",
      enabled: isMcpEventsEnabledSync(env),
      description:
        "REST façade over clawql-mcp-events. Same catalog and subscription store as MCP Events on /mcp.",
    });
  });

  router.get("/events/list", async (req: VirtualKeyRequest, res: Response) => {
    if (!isMcpEventsEnabledSync(env)) {
      sendOpenAiError(
        res,
        503,
        "MCP Events are disabled (CLAWQL_ENABLE_MCP_EVENTS=0)",
        "server_error"
      );
      return;
    }
    const cursor =
      typeof req.query.cursor === "string" && req.query.cursor.trim()
        ? req.query.cursor.trim()
        : undefined;
    try {
      const result = await list({ principal: principalFromReq(req), cursor });
      res.json({ object: "clawql.events.list", ...result });
    } catch (error) {
      mapEventsError(res, error);
    }
  });

  router.post("/events/subscribe", async (req: VirtualKeyRequest, res: Response) => {
    if (!isMcpEventsEnabledSync(env)) {
      sendOpenAiError(
        res,
        503,
        "MCP Events are disabled (CLAWQL_ENABLE_MCP_EVENTS=0)",
        "server_error"
      );
      return;
    }
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
  });

  router.post("/events/unsubscribe", async (req: VirtualKeyRequest, res: Response) => {
    if (!isMcpEventsEnabledSync(env)) {
      sendOpenAiError(
        res,
        503,
        "MCP Events are disabled (CLAWQL_ENABLE_MCP_EVENTS=0)",
        "server_error"
      );
      return;
    }
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

  router.get("/events/subscriptions/:id", async (req: VirtualKeyRequest, res: Response) => {
    if (!isMcpEventsEnabledSync(env)) {
      sendOpenAiError(
        res,
        503,
        "MCP Events are disabled (CLAWQL_ENABLE_MCP_EVENTS=0)",
        "server_error"
      );
      return;
    }
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
      res.json({
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
      });
    } catch (error) {
      mapEventsError(res, error);
    }
  });

  return router;
}
