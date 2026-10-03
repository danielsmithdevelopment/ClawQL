/**
 * Events gateway — Effect Tag wrapping clawql-mcp-events for HTTP /events.
 * Same catalog + subscription store as MCP JSON-RPC on /mcp.
 */

import { Context, Effect, Layer } from "effect";
import {
  CallbackEndpointError,
  InvalidEventError,
  isMcpEventsEnabledSync,
  McpEventsService,
  McpEventsServiceLive,
  runMcpEventsEffect,
  UnauthorizedEventError,
  type ListEventsParams,
  type ListEventsResult,
  type StoredSubscription,
  type SubscribeParams,
  type SubscribeResult,
  type UnsubscribeParams,
} from "clawql-mcp-events";

export type EventsGatewayListInput = ListEventsParams & {
  readonly principal: string;
};

export class EventsGatewayService extends Context.Service<
  EventsGatewayService,
  {
    readonly list: (input: EventsGatewayListInput) => Effect.Effect<ListEventsResult>;
    readonly subscribe: (
      input: SubscribeParams
    ) => Effect.Effect<
      SubscribeResult,
      CallbackEndpointError | InvalidEventError | UnauthorizedEventError
    >;
    readonly unsubscribe: (input: UnsubscribeParams) => Effect.Effect<Record<string, never>>;
    readonly getSubscription: (id: string) => Effect.Effect<StoredSubscription | undefined>;
  }
>()("clawql/inference/EventsGatewayService") {}

export const EventsGatewayLive = Layer.effect(
  EventsGatewayService,
  Effect.gen(function* () {
    const mcp = yield* McpEventsService;
    return {
      list: (input) => mcp.list(input),
      subscribe: (input) => mcp.subscribe(input),
      unsubscribe: (input) => mcp.unsubscribe(input),
      getSubscription: (id) => mcp.getSubscription(id),
    };
  })
).pipe(Layer.provide(McpEventsServiceLive));

function assertEventsEnabled(env: NodeJS.ProcessEnv = process.env): void {
  if (!isMcpEventsEnabledSync(env)) {
    throw new Error("MCP Events are disabled (CLAWQL_ENABLE_MCP_EVENTS=0)");
  }
}

export async function runEventsGatewayList(
  input: EventsGatewayListInput,
  env: NodeJS.ProcessEnv = process.env
): Promise<ListEventsResult> {
  assertEventsEnabled(env);
  return runMcpEventsEffect(
    Effect.gen(function* () {
      const svc = yield* McpEventsService;
      return yield* svc.list(input);
    })
  );
}

export async function runEventsGatewaySubscribe(
  input: SubscribeParams,
  env: NodeJS.ProcessEnv = process.env
): Promise<SubscribeResult> {
  assertEventsEnabled(env);
  return runMcpEventsEffect(
    Effect.gen(function* () {
      const svc = yield* McpEventsService;
      return yield* svc.subscribe(input);
    })
  );
}

export async function runEventsGatewayUnsubscribe(
  input: UnsubscribeParams,
  env: NodeJS.ProcessEnv = process.env
): Promise<Record<string, never>> {
  assertEventsEnabled(env);
  return runMcpEventsEffect(
    Effect.gen(function* () {
      const svc = yield* McpEventsService;
      return yield* svc.unsubscribe(input);
    })
  );
}

export async function runEventsGatewayGetSubscription(
  id: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<StoredSubscription | undefined> {
  assertEventsEnabled(env);
  return runMcpEventsEffect(
    Effect.gen(function* () {
      const svc = yield* McpEventsService;
      return yield* svc.getSubscription(id);
    })
  );
}
