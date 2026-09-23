/**
 * Opt-in ProviderPlugin: three-bucket execute() reachability on MCP pre-execute.
 *
 * Enabled with CLAWQL_CAPABILITY_LIFECYCLE=1. Hosts must bind a session catalog
 * (via getCapabilityLifecycleRuntime().bindSessionCatalog) before tools succeed —
 * fail-closed otherwise.
 *
 * This is the production wiring for §3.5; clawql-core alone is only a library.
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
  readonly bindSessionCatalog: (
    catalog: SessionCatalog
  ) => Effect.Effect<SessionCatalog, Error>;
};

export function capabilityLifecyclePluginEnabled(): boolean {
  return process.env.CLAWQL_CAPABILITY_LIFECYCLE?.trim() === "1";
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
    version: "0.1.0",
    description:
      "Unified Capability Lifecycle §3.5 three-bucket execute reachability (blocking pre-execute)",
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

/** Sync plugins for composeDefaultPlugins when env enabled. */
export function capabilityLifecycleDefaultPlugins(): readonly ProviderPlugin[] {
  return capabilityLifecyclePluginEnabled()
    ? [getCapabilityLifecycleRuntime().plugin]
    : [];
}
