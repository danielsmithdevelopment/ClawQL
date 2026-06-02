import { AuditLive, type ClawQLError, PluginAlreadyRegisteredError } from "clawql-core";
import { Effect, Layer, ManagedRuntime } from "effect";
import { ClawQLApi, clawqlApiLayer } from "./clawql-api-service.js";
import { ExecuteNotConfiguredLive, ExecuteService } from "./execute-service.js";
import { PluginRegistry } from "./plugin-registry.js";
import { SearchNotConfiguredLive, SearchService } from "./search-service.js";

export type ClawQLApiRuntimeServices = ClawQLApi | SearchService | ExecuteService;

export type ClawQLApiRuntimeError = PluginAlreadyRegisteredError | ClawQLError | Error;

export type CreateClawQLApiOptions = {
  /** Replaces default SearchNotConfiguredLive (MCP adapter from clawql-mcp). */
  readonly searchLayer?: Layer.Layer<SearchService, never, never>;
  /** Replaces default ExecuteNotConfiguredLive (MCP adapter from clawql-mcp). */
  readonly executeLayer?: Layer.Layer<ExecuteService, never, never>;
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
    options.searchLayer ?? SearchNotConfiguredLive,
    options.executeLayer ?? ExecuteNotConfiguredLive
  );
  const layer = baseLayer;
  const runtime = ManagedRuntime.make(layer);

  return {
    registry,
    layer,
    runtime,
    run: (program) => runtime.runPromise(program),
  };
}
