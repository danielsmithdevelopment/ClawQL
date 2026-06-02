import { AuditLive, type ClawQLError, PluginAlreadyRegisteredError } from "clawql-core";
import { Effect, Layer, ManagedRuntime } from "effect";
import { ClawQLApi, clawqlApiLayer } from "./clawql-api-service.js";
import { ExecuteNotConfiguredLive, ExecuteService } from "./execute-service.js";
import { PluginRegistry } from "./plugin-registry.js";
import { SearchNotConfiguredLive, SearchService } from "./search-service.js";

export type ClawQLApiRuntimeServices = ClawQLApi | SearchService | ExecuteService;

export type ClawQLApiRuntimeError = PluginAlreadyRegisteredError | ClawQLError | Error;

export type CreateClawQLApiOptions = {
  /** Extra Layers merged after defaults (e.g. SearchLive/ExecuteLive from clawql-mcp adapters). */
  readonly layers?: Layer.Layer<ClawQLApiRuntimeServices, never, never>;
};

export type ClawQLApiHandle = {
  readonly registry: PluginRegistry;
  readonly layer: Layer.Layer<ClawQLApiRuntimeServices, never, never>;
  readonly runtime: ManagedRuntime.ManagedRuntime<ClawQLApiRuntimeServices, never>;
  readonly run: <A, E extends ClawQLApiRuntimeError>(
    program: Effect.Effect<A, E, ClawQLApiRuntimeServices>
  ) => Promise<A>;
};

/**
 * Composition root for ClawQL (enablement §5, plan Phase 1).
 * MCP transport will call `run(searchEffect)` / `run(executeEffect)` in a follow-up PR.
 */
export function createClawQLApi(options: CreateClawQLApiOptions = {}): ClawQLApiHandle {
  const registry = new PluginRegistry();
  const baseLayer: Layer.Layer<ClawQLApiRuntimeServices, never, never> = Layer.mergeAll(
    AuditLive,
    Layer.succeed(ClawQLApi, clawqlApiLayer(registry)),
    SearchNotConfiguredLive,
    ExecuteNotConfiguredLive
  );
  const layer = options.layers ? Layer.mergeAll(baseLayer, options.layers) : baseLayer;
  const runtime = ManagedRuntime.make(layer);

  return {
    registry,
    layer,
    runtime,
    run: (program) => runtime.runPromise(program),
  };
}
