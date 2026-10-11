/**
 * Events gateway — Effect Tag wrapping clawql-mcp-events for HTTP /events.
 * Same catalog + subscription store as MCP JSON-RPC on /mcp.
 */

import { Context, Effect, Layer } from "effect";
import {
  CallbackEndpointError,
  InvalidEventError,
  InboundWebhookError,
  isMcpEventsEnabledSync,
  McpEventsService,
  McpEventsServiceLive,
  runMcpEventsEffect,
  UnauthorizedEventError,
  verifyInboundWebhookEffect,
  type DeliverableEvent,
  type DeliveryOutcome,
  type EventStreamRecord,
  type InboundWebhookInput,
  type ListEventsParams,
  type ListEventsResult,
  type PublicSubscription,
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
    readonly listSubscriptions: (principal: string) => Effect.Effect<readonly PublicSubscription[]>;
    readonly unsubscribeById: (id: string, principal: string) => Effect.Effect<{ ok: boolean }>;
    readonly replayStream: (
      lastSeq: number,
      name?: string
    ) => Effect.Effect<readonly EventStreamRecord[]>;
    readonly subscribeStream: (
      listener: (record: EventStreamRecord) => void
    ) => Effect.Effect<() => void>;
    readonly emit: (event: DeliverableEvent) => Effect.Effect<readonly DeliveryOutcome[]>;
    readonly ingestInbound: (
      input: InboundWebhookInput
    ) => Effect.Effect<DeliverableEvent, InboundWebhookError>;
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
      listSubscriptions: (principal) => mcp.listSubscriptions(principal),
      unsubscribeById: (id, principal) => mcp.unsubscribeById(id, principal),
      replayStream: (lastSeq, name) => mcp.replayStream(lastSeq, name),
      subscribeStream: (listener) => mcp.subscribeStream(listener),
      emit: (event) => mcp.emit(event),
      ingestInbound: (input) =>
        Effect.gen(function* () {
          const event = yield* verifyInboundWebhookEffect(input);
          yield* mcp.emit(event);
          return event;
        }),
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

export async function runEventsGatewayListSubscriptions(
  principal: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<readonly PublicSubscription[]> {
  assertEventsEnabled(env);
  return runMcpEventsEffect(
    Effect.gen(function* () {
      const svc = yield* McpEventsService;
      return yield* svc.listSubscriptions(principal);
    })
  );
}

export async function runEventsGatewayUnsubscribeById(
  id: string,
  principal: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<{ ok: boolean }> {
  assertEventsEnabled(env);
  return runMcpEventsEffect(
    Effect.gen(function* () {
      const svc = yield* McpEventsService;
      return yield* svc.unsubscribeById(id, principal);
    })
  );
}

export async function runEventsGatewayReplayStream(
  lastSeq: number,
  name?: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<readonly EventStreamRecord[]> {
  assertEventsEnabled(env);
  return runMcpEventsEffect(
    Effect.gen(function* () {
      const svc = yield* McpEventsService;
      return yield* svc.replayStream(lastSeq, name);
    })
  );
}

export async function runEventsGatewaySubscribeStream(
  listener: (record: EventStreamRecord) => void,
  env: NodeJS.ProcessEnv = process.env
): Promise<() => void> {
  assertEventsEnabled(env);
  return runMcpEventsEffect(
    Effect.gen(function* () {
      const svc = yield* McpEventsService;
      return yield* svc.subscribeStream(listener);
    })
  );
}

export async function runEventsGatewayInbound(
  input: InboundWebhookInput,
  env: NodeJS.ProcessEnv = process.env
): Promise<DeliverableEvent> {
  assertEventsEnabled(env);
  return runMcpEventsEffect(
    Effect.gen(function* () {
      const svc = yield* McpEventsService;
      const event = yield* verifyInboundWebhookEffect(input);
      yield* svc.emit(event);
      return event;
    })
  );
}
