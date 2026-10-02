/**
 * Lazy session-catalog bootstrap for MCP / host pre-execute (§3.5).
 *
 * When no catalog is bound yet, seed tools = atrScope from:
 *   1. Explicit ATR tokens on the call (JWT / host), else
 *   2. CLAWQL_CAPABILITY_SESSION_SEED (comma-separated), else
 *   3. DEFAULT_CAPABILITY_SESSION_SEED ∪ process-registered MCP tools
 *
 * Hosts call {@link noteProcessRegisteredCapabilityTools} after MCP `registerTools`
 * so optional tools that are actually live on this process are seeded without
 * stuffing every optional into the DEFAULT list (fail-closed for unregistered).
 *
 * Catalog stays frozen after bind — widen only via explicit rebind.
 */

import { Context, Effect, Layer } from "effect";
import { SessionCatalogError, SessionCatalogService } from "./session-catalog.js";
import type { SessionCatalog } from "./types.js";

/**
 * Default seed when ATR tokens are absent — Core MCP surface that is always
 * (or commonly) registered. Operators expand via CLAWQL_CAPABILITY_SESSION_SEED
 * or real ATR claims. Process-registered tools (see noteProcessRegisteredCapabilityTools)
 * are unioned when neither ATR nor SESSION_SEED is set.
 */
export const DEFAULT_CAPABILITY_SESSION_SEED: readonly string[] = [
  "search",
  "execute",
  "cache",
  "audit",
  "skills_list",
  "skills_get",
  "memory_recall",
  "memory_ingest",
  "memory_sync",
  "clawql_think",
  "ouroboros_create_seed_from_document",
  "ouroboros_run_evolutionary_loop",
  "ouroboros_get_lineage_status",
  "ouroboros_measure_drift",
];

/** Process-local MCP tool names published by the host after registerTools. */
const processRegisteredTools = new Set<string>();

export class CapabilityProcessToolSurface extends Context.Tag(
  "clawql/CapabilityProcessToolSurface"
)<
  CapabilityProcessToolSurface,
  {
    readonly note: (names: readonly string[]) => Effect.Effect<void>;
    readonly list: () => Effect.Effect<readonly string[]>;
    readonly clear: () => Effect.Effect<void>;
  }
>() {}

export function makeCapabilityProcessToolSurface(): Context.Tag.Service<
  typeof CapabilityProcessToolSurface
> {
  return {
    note: (names) =>
      Effect.sync(() => {
        for (const n of names) {
          const t = n.trim();
          if (t) processRegisteredTools.add(t);
        }
      }),
    list: () => Effect.sync(() => [...processRegisteredTools]),
    clear: () =>
      Effect.sync(() => {
        processRegisteredTools.clear();
      }),
  };
}

export const CapabilityProcessToolSurfaceLive: Layer.Layer<CapabilityProcessToolSurface> =
  Layer.succeed(CapabilityProcessToolSurface, makeCapabilityProcessToolSurface());

/**
 * Host boundary after MCP registerTools — records tools that are live on this process.
 * Forced sync edge for the MCP registration façade.
 */
export function noteProcessRegisteredCapabilityTools(names: readonly string[]): void {
  Effect.runSync(makeCapabilityProcessToolSurface().note(names));
}

/** Test helper — drop process tool surface between cases. */
export function clearProcessRegisteredCapabilityToolsForTests(): void {
  Effect.runSync(makeCapabilityProcessToolSurface().clear());
}

export function resolveCapabilitySessionSeed(
  atrTokens?: readonly string[] | null
): Effect.Effect<readonly string[]> {
  return Effect.sync(() => {
    if (atrTokens && atrTokens.length > 0) {
      return [...new Set(atrTokens.map((t) => t.trim()).filter(Boolean))];
    }
    const fromEnv = process.env.CLAWQL_CAPABILITY_SESSION_SEED?.trim();
    if (fromEnv) {
      return [
        ...new Set(
          fromEnv
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
        ),
      ];
    }
    return [...new Set([...DEFAULT_CAPABILITY_SESSION_SEED, ...processRegisteredTools])];
  });
}

export class CapabilityCatalogBootstrap extends Context.Tag("clawql/CapabilityCatalogBootstrap")<
  CapabilityCatalogBootstrap,
  {
    /**
     * Bind catalog if missing. Idempotent. Returns the bound (or existing) catalog.
     */
    readonly ensureBound: (args: {
      readonly sessionId: string;
      readonly atrTokens?: readonly string[] | null;
    }) => Effect.Effect<SessionCatalog, SessionCatalogError>;
  }
>() {}

export function makeCapabilityCatalogBootstrap(
  catalogs: Context.Tag.Service<typeof SessionCatalogService>
): Context.Tag.Service<typeof CapabilityCatalogBootstrap> {
  return {
    ensureBound: (args) =>
      Effect.gen(function* () {
        const existing = yield* catalogs.get(args.sessionId);
        if (existing) return existing;
        const seed = yield* resolveCapabilitySessionSeed(args.atrTokens);
        const tools = new Set(seed);
        return yield* catalogs.bind({
          sessionId: args.sessionId,
          tools,
          atrScope: tools,
          boundAt: new Date().toISOString(),
          rebindGeneration: 0,
        });
      }),
  };
}

export const CapabilityCatalogBootstrapLive: Layer.Layer<
  CapabilityCatalogBootstrap,
  never,
  SessionCatalogService
> = Layer.effect(
  CapabilityCatalogBootstrap,
  Effect.gen(function* () {
    const catalogs = yield* SessionCatalogService;
    return makeCapabilityCatalogBootstrap(catalogs);
  })
);

/**
 * Ensure bound using an already-provided SessionCatalogService (hook path).
 * Does not require the CapabilityCatalogBootstrap tag.
 */
export function ensureSessionCatalogBound(args: {
  readonly sessionId: string;
  readonly atrTokens?: readonly string[] | null;
}): Effect.Effect<SessionCatalog, SessionCatalogError, SessionCatalogService> {
  return Effect.gen(function* () {
    const catalogs = yield* SessionCatalogService;
    const existing = yield* catalogs.get(args.sessionId);
    if (existing) return existing;
    const seed = yield* resolveCapabilitySessionSeed(args.atrTokens);
    const tools = new Set(seed);
    return yield* catalogs.bind({
      sessionId: args.sessionId,
      tools,
      atrScope: tools,
      boundAt: new Date().toISOString(),
      rebindGeneration: 0,
    });
  });
}
