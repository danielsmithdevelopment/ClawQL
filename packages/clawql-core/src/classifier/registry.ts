/**
 * Open Fast Decision use-site registry (§3.1 / §3.3).
 */

import { Context, Effect, Layer, Ref } from "effect";
import type { FastDecisionUseSite } from "./types.js";

export class FastDecisionRegistry extends Context.Tag("clawql/FastDecisionRegistry")<
  FastDecisionRegistry,
  {
    readonly register: (useSite: FastDecisionUseSite) => Effect.Effect<void>;
    readonly unregister: (useSiteId: string) => Effect.Effect<boolean>;
    readonly get: (useSiteId: string) => Effect.Effect<FastDecisionUseSite | undefined>;
    readonly list: () => Effect.Effect<readonly FastDecisionUseSite[]>;
  }
>() {}

export const InMemoryFastDecisionRegistryLive: Layer.Layer<FastDecisionRegistry> = Layer.effect(
  FastDecisionRegistry,
  Effect.gen(function* () {
    const ref = yield* Ref.make(new Map<string, FastDecisionUseSite>());
    return {
      register: (useSite) =>
        Ref.update(ref, (m) => {
          const next = new Map(m);
          next.set(useSite.useSiteId, useSite);
          return next;
        }),
      unregister: (useSiteId) =>
        Effect.gen(function* () {
          const m = yield* Ref.get(ref);
          if (!m.has(useSiteId)) return false;
          yield* Ref.update(ref, (cur) => {
            const next = new Map(cur);
            next.delete(useSiteId);
            return next;
          });
          return true;
        }),
      get: (useSiteId) =>
        Effect.gen(function* () {
          const m = yield* Ref.get(ref);
          return m.get(useSiteId);
        }),
      list: () =>
        Effect.gen(function* () {
          const m = yield* Ref.get(ref);
          return [...m.values()];
        }),
    };
  })
);

export function registerUseSites(
  sites: readonly FastDecisionUseSite[]
): Effect.Effect<void, never, FastDecisionRegistry> {
  return Effect.gen(function* () {
    const registry = yield* FastDecisionRegistry;
    for (const site of sites) {
      yield* registry.register(site);
    }
  });
}
