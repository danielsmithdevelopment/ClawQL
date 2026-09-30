import { Effect } from "effect";
import {
  CALLBACK_ENDPOINT_ERROR_CODE,
  CallbackEndpointError,
  InvalidEventError,
  UnauthorizedEventError,
} from "./errors.js";
import { McpEventsService } from "./service.js";
import type { SubscribeParams, UnsubscribeParams } from "./types.js";

export type JsonRpcRequest = {
  jsonrpc?: string;
  id?: unknown;
  method?: string;
  params?: unknown;
};

export type JsonRpcSuccess = {
  jsonrpc: "2.0";
  id: unknown;
  result: unknown;
};

export type JsonRpcFailure = {
  jsonrpc: "2.0";
  id: unknown;
  error: { code: number; message: string; data?: { reason?: string } };
};

export function isMcpEventsJsonRpc(body: unknown): boolean {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const method = (body as { method?: unknown }).method;
  return (
    method === "events/list" ||
    method === "events/subscribe" ||
    method === "events/unsubscribe"
  );
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

/**
 * Handle events/* JSON-RPC. Thin Effect façade for Express / MCP hosts.
 */
export function handleMcpEventsJsonRpc(
  body: JsonRpcRequest,
  principal: string
): Effect.Effect<JsonRpcSuccess | JsonRpcFailure, never, McpEventsService> {
  return Effect.gen(function* () {
    const id = body.id ?? null;
    const method = body.method ?? "";
    const params = asRecord(body.params);
    const svc = yield* McpEventsService;

    try {
      if (method === "events/list") {
        const result = yield* svc.list({
          cursor: typeof params.cursor === "string" ? params.cursor : undefined,
          principal,
        });
        return { jsonrpc: "2.0" as const, id, result };
      }

      if (method === "events/subscribe") {
        const delivery = asRecord(params.delivery);
        const subParams: SubscribeParams = {
          name: String(params.name ?? ""),
          arguments: asRecord(params.arguments),
          delivery: {
            mode: "webhook",
            url: String(delivery.url ?? ""),
            secret: typeof delivery.secret === "string" ? delivery.secret : undefined,
          },
          cursor:
            params.cursor === null
              ? null
              : typeof params.cursor === "string"
                ? params.cursor
                : undefined,
          ttlMs:
            params.ttlMs === null
              ? null
              : typeof params.ttlMs === "number"
                ? params.ttlMs
                : undefined,
          principal,
        };
        const result = yield* svc.subscribe(subParams);
        return { jsonrpc: "2.0" as const, id, result };
      }

      if (method === "events/unsubscribe") {
        const delivery = asRecord(params.delivery);
        const unsub: UnsubscribeParams = {
          name: String(params.name ?? ""),
          arguments: asRecord(params.arguments),
          delivery: {
            mode: "webhook",
            url: String(delivery.url ?? ""),
          },
          principal,
        };
        const result = yield* svc.unsubscribe(unsub);
        return { jsonrpc: "2.0" as const, id, result };
      }

      return {
        jsonrpc: "2.0" as const,
        id,
        error: { code: -32601, message: `Method not found: ${method}` },
      };
    } catch (e) {
      // Effect failures are handled below via catchTag — this is defensive.
      return {
        jsonrpc: "2.0" as const,
        id,
        error: {
          code: -32603,
          message: e instanceof Error ? e.message : String(e),
        },
      };
    }
  }).pipe(
    Effect.catchTag("CallbackEndpointError", (err: CallbackEndpointError) =>
      Effect.succeed({
        jsonrpc: "2.0" as const,
        id: body.id ?? null,
        error: {
          code: CALLBACK_ENDPOINT_ERROR_CODE,
          message: err.message,
          data: { reason: err.reason },
        },
      })
    ),
    Effect.catchTag("InvalidEventError", (err: InvalidEventError) =>
      Effect.succeed({
        jsonrpc: "2.0" as const,
        id: body.id ?? null,
        error: { code: -32602, message: err.message },
      })
    ),
    Effect.catchTag("UnauthorizedEventError", (err: UnauthorizedEventError) =>
      Effect.succeed({
        jsonrpc: "2.0" as const,
        id: body.id ?? null,
        error: { code: -32000, message: err.message },
      })
    )
  );
}
