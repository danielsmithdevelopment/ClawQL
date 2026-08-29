/**
 * In-memory lifecycle hook registry.
 */

import { Effect, Layer, Ref } from "effect";
import { ClawQLError } from "../errors/clawql-error.js";
import { toolMatchesPattern } from "./hook-runtime.js";
import { HookRegistry, type LifecycleHook, type RegisteredHook } from "./provider-types.js";

type HookStore = {
  readonly byPlugin: ReadonlyMap<string, readonly RegisteredHook[]>;
};

function emptyStore(): HookStore {
  return { byPlugin: new Map() };
}

export const InMemoryHookRegistryLive: Layer.Layer<HookRegistry> = Layer.effect(
  HookRegistry,
  Effect.gen(function* () {
    const ref = yield* Ref.make(emptyStore());

    return {
      register: (pluginId, hooks) =>
        Effect.gen(function* () {
          for (const h of hooks) {
            if (h.scope === "tool" && !h.toolPattern?.trim()) {
              return yield* Effect.fail(
                new ClawQLError({
                  reason: `Hook ${h.id}: tool scope requires toolPattern (regex)`,
                })
              );
            }
          }
          const registered: RegisteredHook[] = hooks.map((h) => ({ ...h, pluginId }));
          yield* Ref.update(ref, (store) => {
            const byPlugin = new Map(store.byPlugin);
            byPlugin.set(pluginId, registered);
            return { byPlugin };
          });
        }),

      unregisterPlugin: (pluginId) =>
        Effect.gen(function* () {
          yield* Ref.update(ref, (store) => {
            const byPlugin = new Map(store.byPlugin);
            byPlugin.delete(pluginId);
            return { byPlugin };
          });
        }),

      list: (event, toolName) =>
        Effect.gen(function* () {
          const store = yield* Ref.get(ref);
          const out: RegisteredHook[] = [];
          for (const hooks of store.byPlugin.values()) {
            for (const h of hooks) {
              if (h.event !== event) continue;
              if (h.scope === "tool" && toolName && !toolMatchesPattern(toolName, h.toolPattern)) {
                continue;
              }
              out.push(h);
            }
          }
          return out;
        }),
    };
  })
);

export function validateLifecycleHook(hook: LifecycleHook): Effect.Effect<void, ClawQLError> {
  return Effect.gen(function* () {
    if (!hook.id.trim()) {
      return yield* Effect.fail(new ClawQLError({ reason: "LifecycleHook.id must be non-empty" }));
    }
    if (hook.scope === "tool" && !hook.toolPattern?.trim()) {
      return yield* Effect.fail(
        new ClawQLError({ reason: `Hook ${hook.id}: tool scope requires toolPattern` })
      );
    }
  });
}
