import { Context, Effect, Layer } from "effect";
import { BUILTIN_MCP_EVENT_CATALOG, findEventDefinition } from "./catalog.js";
import {
  assertSafeCallbackUrl,
  readCallbackUrlPolicy,
} from "./callback-url.js";
import {
  createVerificationCache,
  sendSignedEvent,
  verifyCallbackChallenge,
  type VerificationCache,
} from "./delivery.js";
import {
  CallbackEndpointError,
  InvalidEventError,
  UnauthorizedEventError,
} from "./errors.js";
import {
  defaultFeedbackLoopDetector,
  FeedbackLoopDetector,
} from "./feedback-loop.js";
import { screenEventPayload } from "./screen.js";
import { validateWhsecSecret } from "./secret.js";
import {
  createFileSubscriptionStore,
  createMemorySubscriptionStore,
  type SubscriptionStore,
} from "./store.js";
import { deriveSubscriptionId } from "./subscription-id.js";
import type {
  AccessCheck,
  DeliverableEvent,
  DeliveryOutcome,
  ListEventsParams,
  ListEventsResult,
  McpEventDefinition,
  StoredSubscription,
  SubscribeParams,
  SubscribeResult,
  UnsubscribeParams,
  WormAppend,
} from "./types.js";
import { makeWebhookFetch, type WebhookFetch } from "./webhook-fetch.js";

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const MIN_TTL_MS = 60_000;
const SECRET_ROTATION_MS = 5 * 60_000;

export type McpEventsConfig = {
  catalog?: readonly McpEventDefinition[];
  store?: SubscriptionStore;
  webhookFetch?: WebhookFetch;
  verificationCache?: VerificationCache;
  feedback?: FeedbackLoopDetector;
  accessCheck?: AccessCheck;
  wormAppend?: WormAppend;
  defaultTtlMs?: number;
  allowNonExpiring?: boolean;
};

function matchesFilters(
  filters: Record<string, unknown>,
  data: Record<string, unknown>
): boolean {
  for (const [k, v] of Object.entries(filters)) {
    if (v == null || v === "") continue;
    if (data[k] !== v) return false;
  }
  return true;
}

function resolveTtlMs(
  requested: number | null | undefined,
  defaultTtlMs: number,
  allowNonExpiring: boolean
): number | null {
  if (requested === null) {
    return allowNonExpiring ? null : defaultTtlMs;
  }
  if (requested == null) return defaultTtlMs;
  return Math.max(MIN_TTL_MS, Math.min(requested, defaultTtlMs * 7));
}

export class McpEventsService extends Context.Tag("clawql/McpEventsService")<
  McpEventsService,
  {
    readonly list: (
      params: ListEventsParams
    ) => Effect.Effect<ListEventsResult, never>;
    readonly subscribe: (
      params: SubscribeParams
    ) => Effect.Effect<
      SubscribeResult,
      CallbackEndpointError | InvalidEventError | UnauthorizedEventError
    >;
    readonly unsubscribe: (params: UnsubscribeParams) => Effect.Effect<Record<string, never>>;
    readonly emit: (
      event: DeliverableEvent
    ) => Effect.Effect<readonly DeliveryOutcome[]>;
    readonly getSubscription: (
      id: string
    ) => Effect.Effect<StoredSubscription | undefined>;
  }
>() {}

export function makeMcpEventsService(config: McpEventsConfig = {}): Context.Tag.Service<
  typeof McpEventsService
> {
  const catalog = config.catalog ?? BUILTIN_MCP_EVENT_CATALOG;
  const store = config.store ?? createMemorySubscriptionStore();
  const webhookFetch = config.webhookFetch ?? makeWebhookFetch();
  const verificationCache = config.verificationCache ?? createVerificationCache();
  const feedback = config.feedback ?? defaultFeedbackLoopDetector;
  const accessCheck =
    config.accessCheck ??
    ((_input: {
      principal: string;
      eventName: string;
      arguments: Record<string, unknown>;
    }) => true);
  const wormAppend = config.wormAppend;
  const defaultTtlMs = config.defaultTtlMs ?? DEFAULT_TTL_MS;
  const allowNonExpiring = config.allowNonExpiring ?? false;

  const audit = (type: string, payload: Record<string, unknown>) =>
    Effect.tryPromise({
      try: async () => {
        if (wormAppend) await wormAppend({ type, payload });
      },
      catch: () => undefined,
    }).pipe(Effect.catchAll(() => Effect.void));

  return McpEventsService.of({
    list: (_params) =>
      Effect.succeed({
        events: [...catalog],
      }),

    subscribe: (params) =>
      Effect.gen(function* () {
        const def = findEventDefinition(params.name, catalog);
        if (!def) {
          return yield* Effect.fail(
            new InvalidEventError({ message: `Unknown event: ${params.name}` })
          );
        }
        if (params.delivery.mode !== "webhook") {
          return yield* Effect.fail(
            new InvalidEventError({ message: "Only webhook delivery is supported" })
          );
        }
        const args = params.arguments ?? {};
        for (const req of def.inputSchema.required ?? []) {
          if (args[req] == null || args[req] === "") {
            return yield* Effect.fail(
              new InvalidEventError({ message: `Missing required argument: ${req}` })
            );
          }
        }

        const allowed = yield* Effect.tryPromise({
          try: async () =>
            Boolean(
              await accessCheck({
                principal: params.principal,
                eventName: params.name,
                arguments: args,
              })
            ),
          catch: (e) => (e instanceof Error ? e : new Error(String(e))),
        }).pipe(Effect.orElseSucceed(() => false));
        if (!allowed) {
          return yield* Effect.fail(
            new UnauthorizedEventError({
              message: "Not authorized for this event subscription",
            })
          );
        }

        const secretRaw = params.delivery.secret;
        if (!secretRaw) {
          return yield* Effect.fail(
            new CallbackEndpointError({
              message: "delivery.secret is required",
              reason: "invalid_secret",
            })
          );
        }
        const secret = yield* validateWhsecSecret(secretRaw);
        const policy = yield* readCallbackUrlPolicy();
        yield* assertSafeCallbackUrl(params.delivery.url, policy);

        const id = deriveSubscriptionId({
          principal: params.principal,
          url: params.delivery.url,
          name: params.name,
          arguments: args,
        });

        const ttl = resolveTtlMs(params.ttlMs, defaultTtlMs, allowNonExpiring);
        const now = new Date();
        const refreshBefore =
          ttl == null ? null : new Date(now.getTime() + ttl).toISOString();

        const existing = yield* store.findByIdentity(id);
        let previousSecret: string | undefined;
        let previousSecretExpiresAt: string | undefined;
        if (existing && existing.secret !== secret) {
          previousSecret = existing.secret;
          previousSecretExpiresAt = new Date(now.getTime() + SECRET_ROTATION_MS).toISOString();
        }

        const sub: StoredSubscription = {
          id,
          principal: params.principal,
          name: params.name,
          arguments: args,
          url: params.delivery.url,
          secret,
          previousSecret,
          previousSecretExpiresAt,
          refreshBefore,
          cursor: params.cursor ?? existing?.cursor ?? null,
          verified: false,
          createdAt: existing?.createdAt ?? now.toISOString(),
          updatedAt: now.toISOString(),
        };

        yield* verifyCallbackChallenge(sub, webhookFetch, verificationCache);
        sub.verified = true;
        yield* store.upsert(sub);
        yield* audit("mcp_events.subscribe", {
          id,
          principal: params.principal,
          name: params.name,
          url: params.delivery.url,
          refreshBefore,
        });

        return {
          id,
          refreshBefore,
          cursor: sub.cursor,
          truncated: false,
        } satisfies SubscribeResult;
      }),

    unsubscribe: (params) =>
      Effect.gen(function* () {
        const id = deriveSubscriptionId({
          principal: params.principal,
          url: params.delivery.url,
          name: params.name,
          arguments: params.arguments ?? {},
        });
        const existing = yield* store.findByIdentity(id);
        if (existing && existing.principal === params.principal) {
          yield* store.remove(id);
          yield* audit("mcp_events.unsubscribe", {
            id,
            principal: params.principal,
            name: params.name,
          });
        }
        return {};
      }),

    emit: (event) =>
      Effect.gen(function* () {
        const screenedData = yield* screenEventPayload(event.data);
        const screened: DeliverableEvent = { ...event, data: screenedData };
        const all = yield* store.list();
        const matches = all.filter(
          (s: StoredSubscription) =>
            s.verified &&
            s.name === screened.name &&
            matchesFilters(s.arguments, screenedData)
        );

        const outcomes: DeliveryOutcome[] = [];
        for (const sub of matches) {
          const stillAllowed = yield* Effect.tryPromise({
            try: async () =>
              Boolean(
                await accessCheck({
                  principal: sub.principal,
                  eventName: sub.name,
                  arguments: sub.arguments,
                })
              ),
            catch: (e) => (e instanceof Error ? e : new Error(String(e))),
          }).pipe(Effect.orElseSucceed(() => false));
          if (!stillAllowed) {
            yield* store.remove(sub.id);
            yield* audit("mcp_events.access_revoked", { id: sub.id });
            outcomes.push({
              accepted: false,
              status: 0,
              attempts: 0,
              stopped: true,
              reason: "access_revoked",
            });
            continue;
          }

          const looping = yield* feedback.wouldLoop(sub.id, screened.name);
          if (looping) {
            yield* audit("mcp_events.feedback_loop", {
              id: sub.id,
              name: screened.name,
              eventId: screened.eventId,
            });
            outcomes.push({
              accepted: false,
              status: 0,
              attempts: 0,
              stopped: true,
              reason: "feedback_loop",
            });
            continue;
          }

          const outcome = yield* sendSignedEvent(sub, screened, webhookFetch);
          yield* feedback.record({
            subscriptionId: sub.id,
            eventName: screened.name,
            at: Date.now(),
          });
          yield* audit("mcp_events.delivery", {
            id: sub.id,
            eventId: screened.eventId,
            name: screened.name,
            accepted: outcome.accepted,
            status: outcome.status,
            attempts: outcome.attempts,
            reason: outcome.reason,
          });
          if (outcome.reason === "gone") {
            yield* store.remove(sub.id);
          }
          outcomes.push(outcome);
        }
        return outcomes;
      }),

    getSubscription: (id) => store.get(id),
  });
}

export const McpEventsServiceLive = Layer.succeed(
  McpEventsService,
  makeMcpEventsService({
    store: createFileSubscriptionStore(),
  })
);

export function McpEventsServiceLayer(config: McpEventsConfig = {}): Layer.Layer<McpEventsService> {
  return Layer.succeed(McpEventsService, makeMcpEventsService(config));
}

export function runMcpEventsEffect<A, E>(
  program: Effect.Effect<A, E, McpEventsService>,
  config?: McpEventsConfig
): Promise<A> {
  return Effect.runPromise(
    program.pipe(Effect.provide(config ? McpEventsServiceLayer(config) : McpEventsServiceLive))
  );
}
