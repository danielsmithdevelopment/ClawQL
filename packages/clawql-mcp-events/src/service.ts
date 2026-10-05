import { Context, Effect, Layer } from "effect";
import { EventPayloadId, name } from "clawql-gdp";
import { BUILTIN_MCP_EVENT_CATALOG, findEventDefinition } from "./catalog.js";
import { payloadRedactedEffect } from "./proofs/payload-redacted.js";
import { assertSafeCallbackUrl, readCallbackUrlPolicy } from "./callback-url.js";
import {
  createVerificationCache,
  sendSignedEvent,
  verifyCallbackChallenge,
  type VerificationCache,
} from "./delivery.js";
import { CallbackEndpointError, InvalidEventError, UnauthorizedEventError } from "./errors.js";
import { defaultFeedbackLoopDetector, FeedbackLoopDetector } from "./feedback-loop.js";
import {
  assertCallbackAllowlisted,
  DeliveryRateLimiter,
  readEnterpriseEventsPolicy,
  type EnterpriseEventsPolicy,
} from "./enterprise.js";
import {
  createCoalesceState,
  dropPendingForSubscription,
  flushReadyPending,
  markDelivered,
  takeOrHoldDelivery,
} from "./coalesce.js";
import { notifyStreamTopicReleased } from "./lifecycle.js";
import { gatewayRedactPayload } from "clawql-api";
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
  PublicSubscription,
  StoredSubscription,
  SubscribeParams,
  SubscribeResult,
  UnsubscribeParams,
  WormAppend,
} from "./types.js";
import {
  createEventStreamBuffer,
  type EventStreamBuffer,
  type EventStreamRecord,
} from "./event-stream.js";
import {
  assertEventStreamPublisherForManagedEffect,
  natsEventSubjectEffect,
  natsMsgIdEffect,
  publishEventStreamEffect,
  type EventStreamPublisher,
} from "./nats-subjects.js";
import { matchesEventFiltersEffect } from "./subscription-match.js";
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
  enterprise?: EnterpriseEventsPolicy;
  rateLimiter?: DeliveryRateLimiter;
  eventStream?: EventStreamBuffer;
  eventStreamPublisher?: EventStreamPublisher;
};

const toPublic = (s: StoredSubscription): PublicSubscription => ({
  id: s.id,
  principal: s.principal,
  name: s.name,
  arguments: s.arguments,
  url: s.url,
  refreshBefore: s.refreshBefore,
  cursor: s.cursor,
  verified: s.verified,
  createdAt: s.createdAt,
  updatedAt: s.updatedAt,
});

function topicFromSubscription(sub: StoredSubscription): string | null {
  const t = sub.arguments?.topic;
  return typeof t === "string" && t.trim() ? t.trim() : null;
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

export class McpEventsService extends Context.Service<
  McpEventsService,
  {
    readonly list: (params: ListEventsParams) => Effect.Effect<ListEventsResult, never>;
    readonly subscribe: (
      params: SubscribeParams
    ) => Effect.Effect<
      SubscribeResult,
      CallbackEndpointError | InvalidEventError | UnauthorizedEventError
    >;
    readonly unsubscribe: (params: UnsubscribeParams) => Effect.Effect<Record<string, never>>;
    readonly emit: (event: DeliverableEvent) => Effect.Effect<readonly DeliveryOutcome[]>;
    /** Flush coalesced stream.changed deliveries that have waited out the min interval. */
    readonly flushCoalesced: () => Effect.Effect<readonly DeliveryOutcome[]>;
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
  }
>()("clawql/McpEventsService") {}

export function makeMcpEventsService(
  config: McpEventsConfig = {}
): Context.Service.Shape<typeof McpEventsService> {
  const catalog = config.catalog ?? BUILTIN_MCP_EVENT_CATALOG;
  const store = config.store ?? createMemorySubscriptionStore();
  const webhookFetch = config.webhookFetch ?? makeWebhookFetch();
  const verificationCache = config.verificationCache ?? createVerificationCache();
  const feedback = config.feedback ?? defaultFeedbackLoopDetector;
  const accessCheck =
    config.accessCheck ??
    ((_input: { principal: string; eventName: string; arguments: Record<string, unknown> }) =>
      true);
  const wormAppend = config.wormAppend;
  const defaultTtlMs = config.defaultTtlMs ?? DEFAULT_TTL_MS;
  const allowNonExpiring = config.allowNonExpiring ?? false;
  const enterprise = config.enterprise ?? Effect.runSync(readEnterpriseEventsPolicy());
  const rateLimiter =
    config.rateLimiter ?? new DeliveryRateLimiter(enterprise.maxDeliveriesPerMinutePerPrincipal);
  const coalesce = createCoalesceState(enterprise.coalesceIntervalMs);
  const eventStream = config.eventStream ?? createEventStreamBuffer();
  const eventStreamPublisher = config.eventStreamPublisher;
  Effect.runSync(assertEventStreamPublisherForManagedEffect(eventStreamPublisher));

  const audit = (type: string, payload: Record<string, unknown>) =>
    Effect.tryPromise({
      try: async () => {
        if (wormAppend) await wormAppend({ type, payload });
      },
      catch: () => undefined,
    }).pipe(Effect.catch(() => Effect.void));

  const deliverOne = (
    sub: StoredSubscription,
    screened: DeliverableEvent
  ): Effect.Effect<DeliveryOutcome> =>
    Effect.gen(function* () {
      const looping = yield* feedback.wouldLoop(sub.id, screened.name);
      if (looping) {
        yield* audit("mcp_events.feedback_loop", {
          id: sub.id,
          name: screened.name,
          eventId: screened.eventId,
        });
        return {
          accepted: false,
          status: 0,
          attempts: 0,
          stopped: true,
          reason: "feedback_loop",
        } satisfies DeliveryOutcome;
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
        coalesced_count: screened.data.coalesced_count,
      });
      if (outcome.reason === "gone") {
        dropPendingForSubscription(coalesce, sub.id);
        yield* store.remove(sub.id);
        const topic = topicFromSubscription(sub);
        if (topic && sub.name === "stream.changed") {
          notifyStreamTopicReleased(topic, "gone");
        }
      }
      return outcome;
    });

  const flushCoalescedInternal = (): Effect.Effect<readonly DeliveryOutcome[]> =>
    Effect.gen(function* () {
      const ready = flushReadyPending(coalesce, {
        canDeliver: () => true,
      });
      const outcomes: DeliveryOutcome[] = [];
      const all = yield* store.list();
      const byId = new Map(all.map((s) => [s.id, s]));
      for (const item of ready) {
        const sub = byId.get(item.subscriptionId);
        if (!sub) {
          dropPendingForSubscription(coalesce, item.subscriptionId);
          continue;
        }
        if (!rateLimiter.tryConsume(sub.principal)) {
          coalesce.pending.set(item.subscriptionId, {
            event: item.event,
            firstAt: Date.now() - enterprise.coalesceIntervalMs,
            lastAt: Date.now(),
            mergedCount:
              typeof item.event.data.coalesced_count === "number"
                ? item.event.data.coalesced_count
                : 1,
          });
          coalesce.lastDeliveredAt.delete(item.subscriptionId);
          outcomes.push({
            accepted: false,
            status: 429,
            attempts: 0,
            stopped: false,
            reason: "rate_limited_coalesced",
          });
          continue;
        }
        const outcome = yield* deliverOne(sub, item.event);
        if (outcome.accepted) markDelivered(coalesce, item.subscriptionId);
        outcomes.push(outcome);
      }
      return outcomes;
    });

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
        const safeUrl = yield* assertSafeCallbackUrl(params.delivery.url, policy);
        yield* assertCallbackAllowlisted(safeUrl, enterprise.callbackAllowlist);

        const id = deriveSubscriptionId({
          principal: params.principal,
          url: params.delivery.url,
          name: params.name,
          arguments: args,
        });

        const existing = yield* store.findByIdentity(id);
        if (!existing) {
          const all = yield* store.list();
          const countForPrincipal = all.filter((s) => s.principal === params.principal).length;
          if (countForPrincipal >= enterprise.maxSubscriptionsPerPrincipal) {
            return yield* Effect.fail(
              new UnauthorizedEventError({
                message: `Subscription cap reached (${enterprise.maxSubscriptionsPerPrincipal} per principal)`,
              })
            );
          }
        }

        const ttl = resolveTtlMs(params.ttlMs, defaultTtlMs, allowNonExpiring);
        const now = new Date();
        const refreshBefore = ttl == null ? null : new Date(now.getTime() + ttl).toISOString();

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
          dropPendingForSubscription(coalesce, id);
          yield* store.remove(id);
          yield* audit("mcp_events.unsubscribe", {
            id,
            principal: params.principal,
            name: params.name,
          });
          if (existing.name === "stream.changed") {
            const topic = topicFromSubscription(existing);
            if (topic) notifyStreamTopicReleased(topic, "unsubscribe");
          }
        }
        return {};
      }),

    emit: (event) =>
      Effect.gen(function* () {
        const screenedData = yield* screenEventPayload(event.data);
        const redactedData = enterprise.redactPii
          ? ((yield* Effect.tryPromise({
              try: () => gatewayRedactPayload(screenedData),
              catch: (e) => (e instanceof Error ? e : new Error(String(e))),
            }).pipe(Effect.orElseSucceed(() => screenedData))) as Record<string, unknown>)
          : screenedData;
        const screened: DeliverableEvent = { ...event, data: redactedData };
        const streamRecord = yield* eventStream.append(screened);
        if (eventStreamPublisher) {
          const tenantRaw = redactedData.tenant ?? redactedData.topic;
          const tenant =
            typeof tenantRaw === "string" && tenantRaw.trim() ? tenantRaw.trim() : "default";
          const subject = yield* natsEventSubjectEffect(screened.name, tenant);
          const msgId = yield* natsMsgIdEffect(screened.eventId);
          const publisher = eventStreamPublisher;
          yield* name(EventPayloadId(screened.eventId), (namedEvent) =>
            Effect.gen(function* () {
              const proof = yield* payloadRedactedEffect(namedEvent, {
                eventId: screened.eventId,
                data: redactedData,
              });
              if (!proof) {
                return yield* Effect.fail(new Error("PayloadRedacted proof failed"));
              }
              return yield* publishEventStreamEffect(namedEvent, proof, publisher, {
                event: screened,
                cloudEvent: streamRecord.cloudEvent,
                tenant,
                seq: streamRecord.seq,
              }).pipe(
                Effect.catch(() => Effect.void),
                Effect.tap(() =>
                  audit("mcp_events.stream_publish", {
                    eventId: screened.eventId,
                    subject,
                    msgId,
                    seq: streamRecord.seq,
                  })
                )
              );
            })
          );
        }
        const all = yield* store.list();
        const matches: StoredSubscription[] = [];
        for (const s of all) {
          if (!s.verified || s.name !== screened.name) continue;
          if (yield* matchesEventFiltersEffect(s.arguments, redactedData)) matches.push(s);
        }

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
            dropPendingForSubscription(coalesce, sub.id);
            yield* store.remove(sub.id);
            yield* audit("mcp_events.access_revoked", { id: sub.id });
            if (sub.name === "stream.changed") {
              const topic = topicFromSubscription(sub);
              if (topic) notifyStreamTopicReleased(topic, "access_revoked");
            }
            outcomes.push({
              accepted: false,
              status: 0,
              attempts: 0,
              stopped: true,
              reason: "access_revoked",
            });
            continue;
          }

          const rateOk = rateLimiter.wouldAllow(sub.principal);
          const coalesceable =
            screened.name === "stream.changed" && (enterprise.coalesceIntervalMs > 0 || !rateOk);

          if (coalesceable) {
            const toSend = takeOrHoldDelivery(coalesce, sub.id, screened, {
              rateLimited: !rateOk,
            });
            if (!toSend) {
              yield* audit("mcp_events.coalesced", {
                id: sub.id,
                principal: sub.principal,
                eventId: screened.eventId,
                rate_limited: !rateOk,
              });
              outcomes.push({
                accepted: false,
                status: 0,
                attempts: 0,
                stopped: false,
                reason: rateOk ? "coalesced" : "rate_limited_coalesced",
              });
              continue;
            }
            if (!rateLimiter.tryConsume(sub.principal)) {
              // Race: capacity vanished; hold for later flush
              takeOrHoldDelivery(coalesce, sub.id, toSend, { rateLimited: true });
              outcomes.push({
                accepted: false,
                status: 0,
                attempts: 0,
                stopped: false,
                reason: "rate_limited_coalesced",
              });
              continue;
            }
            const outcome = yield* deliverOne(sub, toSend);
            if (outcome.accepted) markDelivered(coalesce, sub.id);
            outcomes.push(outcome);
            continue;
          }

          if (!rateLimiter.tryConsume(sub.principal)) {
            yield* audit("mcp_events.rate_limited", {
              id: sub.id,
              principal: sub.principal,
              eventId: screened.eventId,
            });
            outcomes.push({
              accepted: false,
              status: 429,
              attempts: 0,
              stopped: false,
              reason: "rate_limited",
            });
            continue;
          }

          outcomes.push(yield* deliverOne(sub, screened));
        }

        const flushed = yield* flushCoalescedInternal();
        outcomes.push(...flushed);
        return outcomes;
      }),

    flushCoalesced: () => flushCoalescedInternal(),

    getSubscription: (id) => store.get(id),

    listSubscriptions: (principal) =>
      Effect.gen(function* () {
        const all = yield* store.list();
        return all.filter((s) => s.principal === principal).map(toPublic);
      }),

    unsubscribeById: (id, principal) =>
      Effect.gen(function* () {
        const existing = yield* store.get(id);
        if (!existing || existing.principal !== principal) {
          return { ok: false };
        }
        dropPendingForSubscription(coalesce, id);
        yield* store.remove(id);
        yield* audit("mcp_events.unsubscribe", {
          id,
          principal,
          name: existing.name,
        });
        if (existing.name === "stream.changed") {
          const topic = topicFromSubscription(existing);
          if (topic) notifyStreamTopicReleased(topic, "unsubscribe");
        }
        return { ok: true };
      }),

    replayStream: (lastSeq, name) => eventStream.replayFrom(lastSeq, name),
    subscribeStream: (listener) => eventStream.subscribe(listener),
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
