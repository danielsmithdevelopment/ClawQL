/**
 * Session catalog — bucket 1 (Unified Capability Lifecycle v0.2 §3.5 / §3.5.2).
 * Frozen after bind; mid-session changes only via explicit rebind.
 */

import { Context, Effect, Layer, Ref } from "effect";
import { Data } from "effect";
import { WormAuditSink, type WormAuditEvent } from "../plugin/provider-types.js";
import type { SessionCatalog, SessionCatalogRebindInput } from "./types.js";

export class SessionCatalogError extends Data.TaggedError("SessionCatalogError")<{
  readonly reason: string;
}> {}

export class SessionCatalogService extends Context.Tag("clawql/SessionCatalogService")<
  SessionCatalogService,
  {
    readonly bind: (catalog: SessionCatalog) => Effect.Effect<SessionCatalog, SessionCatalogError>;
    readonly get: (sessionId: string) => Effect.Effect<SessionCatalog | undefined>;
    /**
     * Explicit session rebind (§3.5.2). Default: new scope ⊆ prior S.
     * Wider scope requires explicitWiderScopeGrant with its own WORM.
     */
    readonly rebind: (
      input: SessionCatalogRebindInput
    ) => Effect.Effect<SessionCatalog, SessionCatalogError, WormAuditSink>;
    readonly hasTool: (sessionId: string, toolName: string) => Effect.Effect<boolean>;
  }
>() {}

function toSet(xs: readonly string[]): ReadonlySet<string> {
  return new Set(xs);
}

export const InMemorySessionCatalogLive: Layer.Layer<SessionCatalogService> = Layer.effect(
  SessionCatalogService,
  Effect.gen(function* () {
    const ref = yield* Ref.make(new Map<string, SessionCatalog>());

    return {
      bind: (catalog) =>
        Effect.gen(function* () {
          const m = yield* Ref.get(ref);
          if (m.has(catalog.sessionId)) {
            return yield* Effect.fail(
              new SessionCatalogError({
                reason: `session catalog already bound for ${catalog.sessionId} — use rebind`,
              })
            );
          }
          // Tools must be ⊆ atrScope
          for (const t of catalog.tools) {
            if (!catalog.atrScope.has(t)) {
              return yield* Effect.fail(
                new SessionCatalogError({
                  reason: `tool ${t} not in atrScope at bind`,
                })
              );
            }
          }
          yield* Ref.update(ref, (cur) => {
            const next = new Map(cur);
            next.set(catalog.sessionId, catalog);
            return next;
          });
          return catalog;
        }),

      get: (sessionId) =>
        Effect.gen(function* () {
          const m = yield* Ref.get(ref);
          return m.get(sessionId);
        }),

      hasTool: (sessionId, toolName) =>
        Effect.gen(function* () {
          const m = yield* Ref.get(ref);
          return m.get(sessionId)?.tools.has(toolName) ?? false;
        }),

      rebind: (input) =>
        Effect.gen(function* () {
          const worm = yield* WormAuditSink;
          const m = yield* Ref.get(ref);
          const prior = m.get(input.sessionId);
          if (!prior) {
            return yield* Effect.fail(
              new SessionCatalogError({
                reason: `no session catalog for rebind: ${input.sessionId}`,
              })
            );
          }

          const grantWider = input.explicitWiderScopeGrant ?? [];
          const baseScope = input.newAtrScope
            ? toSet(input.newAtrScope)
            : prior.atrScope;

          // Default: rebound catalog scope ⊆ prior S
          const nextScope = new Set<string>();
          for (const token of baseScope) {
            if (prior.atrScope.has(token) || grantWider.includes(token)) {
              nextScope.add(token);
            } else {
              return yield* Effect.fail(
                new SessionCatalogError({
                  reason: `rebind would widen S with token ${token} without explicitWiderScopeGrant`,
                })
              );
            }
          }
          for (const token of grantWider) {
            nextScope.add(token);
          }

          const tools = toSet(input.newTools);
          for (const t of tools) {
            if (!nextScope.has(t)) {
              return yield* Effect.fail(
                new SessionCatalogError({
                  reason: `rebind tool ${t} not in rebound atrScope`,
                })
              );
            }
          }

          const catalog: SessionCatalog = {
            sessionId: input.sessionId,
            atrScope: nextScope,
            tools,
            boundAt: new Date().toISOString(),
            rebindGeneration: prior.rebindGeneration + 1,
          };

          yield* Ref.update(ref, (cur) => {
            const next = new Map(cur);
            next.set(input.sessionId, catalog);
            return next;
          });

          yield* worm.append({
            type: "SESSION_CATALOG_REBOUND",
            sessionId: input.sessionId,
            authorizedBy: input.authorizedBy,
            rebindGeneration: catalog.rebindGeneration,
            toolCount: catalog.tools.size,
            atrScopeSize: catalog.atrScope.size,
            widerScopeGranted: grantWider.length > 0,
            timestamp: new Date().toISOString(),
          } as WormAuditEvent);

          if (grantWider.length > 0) {
            yield* worm.append({
              type: "SESSION_SCOPE_WIDENED",
              sessionId: input.sessionId,
              authorizedBy: input.authorizedBy,
              grantedTokens: grantWider,
              timestamp: new Date().toISOString(),
            } as WormAuditEvent);
          }

          return catalog;
        }),
    };
  })
);
