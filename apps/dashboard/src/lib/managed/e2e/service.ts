import { Context, Effect, Layer } from "effect";

import {
  appendAudit,
  deliverEventToSubscriptions,
  e2eEnabled,
  getWorld,
  keyByBearer,
  newId,
  personByName,
  pushEvent,
  recountReviewBadges,
  resetWorld,
  verifyChain,
  type E2eAuditEntry,
  type E2eEvent,
  type E2eKey,
  type World,
} from "@/lib/managed/e2e/world";

export class E2eHarness extends Context.Service<
  E2eHarness,
  {
    readonly enabled: () => Effect.Effect<boolean>;
    readonly reset: () => Effect.Effect<World>;
    readonly world: () => Effect.Effect<World>;
    readonly verifyChain: () => Effect.Effect<ReturnType<typeof verifyChain>>;
    readonly appendAudit: (
      actor: string,
      action: string,
      outcome: string,
      meta?: Record<string, unknown>,
    ) => Effect.Effect<E2eAuditEntry>;
    readonly keyByBearer: (auth: string | null) => Effect.Effect<E2eKey | null>;
    readonly newId: (prefix: string) => Effect.Effect<string>;
    readonly personByName: (name: string) => Effect.Effect<ReturnType<typeof personByName>>;
    readonly pushEvent: (
      type: string,
      payload: unknown,
      opts?: { inbound?: boolean; untrusted?: boolean; test?: boolean; source?: string },
    ) => Effect.Effect<E2eEvent>;
    readonly deliverEvent: (evt: E2eEvent) => Effect.Effect<void>;
    readonly recountBadges: () => Effect.Effect<void>;
  }
>()("clawql/E2eHarness") {}

export const E2eHarnessLive = Layer.succeed(
  E2eHarness,
  E2eHarness.of({
    enabled: () => Effect.sync(() => e2eEnabled()),
    reset: () => Effect.sync(() => resetWorld()),
    world: () => Effect.sync(() => getWorld()),
    verifyChain: () => Effect.sync(() => verifyChain()),
    appendAudit: (actor, action, outcome, meta) =>
      Effect.sync(() => appendAudit(actor, action, outcome, meta)),
    keyByBearer: (auth) => Effect.sync(() => keyByBearer(auth)),
    newId: (prefix) => Effect.sync(() => newId(prefix)),
    personByName: (name) => Effect.sync(() => personByName(name)),
    pushEvent: (type, payload, opts) => Effect.sync(() => pushEvent(type, payload, opts)),
    deliverEvent: (evt) =>
      Effect.tryPromise({
        try: () => deliverEventToSubscriptions(evt),
        catch: () => undefined as void,
      }),
    recountBadges: () => Effect.sync(() => recountReviewBadges()),
  }),
);

export function runE2eEffect<A, E>(program: Effect.Effect<A, E, E2eHarness>): Promise<A> {
  return Effect.runPromise(program.pipe(Effect.provide(E2eHarnessLive)));
}
