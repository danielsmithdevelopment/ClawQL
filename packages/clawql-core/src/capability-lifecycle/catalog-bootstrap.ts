/**
 * Lazy session-catalog bootstrap for MCP / host pre-execute (§3.5).
 *
 * When no catalog is bound yet, seed tools = atrScope from:
 *   1. Explicit ATR tokens on the call (JWT / host), else
 *   2. CLAWQL_CAPABILITY_SESSION_SEED (comma-separated), else
 *   3. DEFAULT_CAPABILITY_SESSION_SEED (Core MCP tools)
 *
 * Catalog stays frozen after bind — widen only via explicit rebind.
 */

import { Context, Effect, Layer } from "effect";
import { SessionCatalogError, SessionCatalogService } from "./session-catalog.js";
import type { SessionCatalog } from "./types.js";

/**
 * Default seed when ATR tokens are absent — Core MCP surface that is always
 * (or commonly) registered. Operators expand via CLAWQL_CAPABILITY_SESSION_SEED
 * or real ATR claims. Optional tools not listed remain fail-closed until seeded.
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

export function resolveCapabilitySessionSeed(
  atrTokens?: readonly string[] | null
): readonly string[] {
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
  return [...DEFAULT_CAPABILITY_SESSION_SEED];
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
        const seed = resolveCapabilitySessionSeed(args.atrTokens);
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
    const seed = resolveCapabilitySessionSeed(args.atrTokens);
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
