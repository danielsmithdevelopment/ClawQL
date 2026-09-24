/**
 * Default-on ProviderPlugin: three-bucket execute() reachability on MCP pre-execute.
 *
 * Enabled unless CLAWQL_CAPABILITY_LIFECYCLE=0. Hosts may still call
 * bindSessionCatalog explicitly; otherwise the blocking hook lazily seeds the
 * catalog from ATR tokens or CLAWQL_CAPABILITY_SESSION_SEED /
 * DEFAULT_CAPABILITY_SESSION_SEED (see catalog-bootstrap.ts).
 *
 * Harness register-side stays opt-in via CLAWQL_HARNESS_CAPABILITY_REGISTER —
 * this MCP gate never enables it.
 */

import {
  CapabilityRegisterIntercept,
  createCapabilityReachabilityHook,
  createSharedCapabilityCatalogLayer,
  defineProviderPlugin,
  PromotionStore,
  SessionCatalogService,
  type ProviderPlugin,
  type SessionCatalog,
} from "clawql-core";
import { Effect, type Layer } from "effect";

export const CAPABILITY_LIFECYCLE_PLUGIN_ID = "capability-lifecycle-three-bucket";

export type CapabilityCatalogLayer = Layer.Layer<
  SessionCatalogService | PromotionStore | CapabilityRegisterIntercept
>;

export type CapabilityLifecyclePluginHandle = {
  readonly plugin: ProviderPlugin;
  readonly catalogLayer: CapabilityCatalogLayer;
  readonly bindSessionCatalog: (catalog: SessionCatalog) => Effect.Effect<SessionCatalog, Error>;
};

/**
 * Default **on**. Explicit `CLAWQL_CAPABILITY_LIFECYCLE=0` opts out.
 * Legacy `=1` remains on (same as unset).
 */
export function capabilityLifecyclePluginEnabled(): boolean {
  const raw = process.env.CLAWQL_CAPABILITY_LIFECYCLE?.trim();
  if (raw === "0" || raw?.toLowerCase() === "false" || raw?.toLowerCase() === "off") {
    return false;
  }
  return true;
}

let processRuntime: CapabilityLifecyclePluginHandle | undefined;

/**
 * Process singleton — same catalog Maps across defaultPlugins + host bind calls.
 */
export function getCapabilityLifecycleRuntime(): CapabilityLifecyclePluginHandle {
  if (!processRuntime) {
    processRuntime = createCapabilityLifecyclePlugin();
  }
  return processRuntime;
}

/** Test helper — drop singleton between cases. */
export function resetCapabilityLifecycleRuntimeForTests(): void {
  processRuntime = undefined;
}

/**
 * Build plugin + process-stable catalog Layer. Prefer getCapabilityLifecycleRuntime()
 * for production so bind and hooks share state.
 */
export function createCapabilityLifecyclePlugin(): CapabilityLifecyclePluginHandle {
  const catalogLayer = createSharedCapabilityCatalogLayer();
  const hook = createCapabilityReachabilityHook({ catalogLayer });
  const plugin = defineProviderPlugin({
    id: CAPABILITY_LIFECYCLE_PLUGIN_ID,
    version: "0.2.0",
    description:
      "Unified Capability Lifecycle §3.5 three-bucket execute reachability (blocking pre-execute; default-on)",
    hooks: [hook],
  });

  return {
    plugin,
    catalogLayer,
    bindSessionCatalog: (catalog) =>
      Effect.gen(function* () {
        const catalogs = yield* SessionCatalogService;
        return yield* catalogs.bind(catalog);
      }).pipe(Effect.provide(catalogLayer)),
  };
}

/** Sync plugins for composeDefaultPlugins when enabled (default-on). */
export function capabilityLifecycleDefaultPlugins(): readonly ProviderPlugin[] {
  return capabilityLifecyclePluginEnabled() ? [getCapabilityLifecycleRuntime().plugin] : [];
}
