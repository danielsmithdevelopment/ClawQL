/**
 * Wire CapabilityRegisterIntercept into harness tool registration (§3.5.1).
 *
 * Opt-in (harness-specific — does NOT share CLAWQL_CAPABILITY_LIFECYCLE with the
 * MCP pre-execute gate, so enabling MCP enforcement cannot silently empty harness
 * tool maps):
 *   - config.enableCapabilityRegisterIntercept === true, or
 *   - CLAWQL_HARNESS_CAPABILITY_REGISTER=1
 *
 * Default wiring shares the process catalog Layer from
 * clawql-api `getCapabilityLifecycleRuntime()` so MCP bindSessionCatalog and
 * harness register see the same Maps.
 */

import {
  CapabilityRegisterIntercept,
  SessionCatalogService,
  WormAuditSink,
  createSharedCapabilityCatalogLayer,
  type PromotionStore,
  type RegisterInterceptOutcome,
} from "clawql-core";
import { getCapabilityLifecycleRuntime } from "clawql-api";
import { Effect, Layer, type Layer as LayerT } from "effect";
import type { HarnessScope, HarnessTool } from "./types.js";
import { HarnessPluginError as HarnessPluginErrorClass } from "./types.js";

export const CLAWQL_HARNESS_REGISTER_ID = "clawql-harness";

export type CapabilityRegisterWiring = {
  readonly layer: LayerT.Layer<
    SessionCatalogService | PromotionStore | CapabilityRegisterIntercept | WormAuditSink
  >;
  readonly harnessId: string;
};

/**
 * Harness register-side only. Deliberately ignores CLAWQL_CAPABILITY_LIFECYCLE
 * (that flag is the MCP pre-execute gate).
 */
export function capabilityRegisterInterceptEnabled(explicit?: boolean): boolean {
  if (explicit === true) return true;
  if (explicit === false) return false;
  return process.env.CLAWQL_HARNESS_CAPABILITY_REGISTER?.trim() === "1";
}

/** Sync-safe WORM sink for the register boundary (no async Ref bootstrap). */
const SyncMemoryWormLive: LayerT.Layer<WormAuditSink> = Layer.succeed(WormAuditSink, {
  append: () => Effect.void,
});

/**
 * Prefer the process-shared catalog from clawql-api so MCP bindSessionCatalog
 * and harness register-side see the same session Maps.
 */
export function defaultCapabilityRegisterWiring(): CapabilityRegisterWiring {
  const runtime = getCapabilityLifecycleRuntime();
  return {
    harnessId: CLAWQL_HARNESS_REGISTER_ID,
    layer: Layer.mergeAll(runtime.catalogLayer, SyncMemoryWormLive),
  };
}

/** Isolated wiring for unit tests (does not touch process singleton). */
export function isolatedCapabilityRegisterWiring(): CapabilityRegisterWiring {
  return {
    harnessId: CLAWQL_HARNESS_REGISTER_ID,
    layer: Layer.mergeAll(createSharedCapabilityCatalogLayer(), SyncMemoryWormLive),
  };
}

export type RegisterToolWithInterceptResult = {
  readonly accepted: boolean;
  readonly outcome: RegisterInterceptOutcome;
};

/**
 * Report a harness tool registration through clawql-core. Sync host boundary.
 * When denied (routed_to_sandbox), caller must not treat the tool as execute-live.
 */
export function reportHarnessToolRegistration(args: {
  readonly wiring: CapabilityRegisterWiring;
  readonly sessionId: string;
  readonly tool: HarnessTool;
  readonly markImplemented?: boolean;
}): RegisterToolWithInterceptResult {
  const { wiring, sessionId, tool } = args;
  const program = Effect.gen(function* () {
    const intercept = yield* CapabilityRegisterIntercept;
    if (args.markImplemented !== false) {
      yield* intercept.markImplemented(wiring.harnessId);
    }
    return yield* intercept.reportRegistration({
      sessionId,
      toolName: tool.name,
      harnessId: wiring.harnessId,
      mechanism: "tool_registry_mutation",
    });
  });

  const outcome = Effect.runSync(program.pipe(Effect.provide(wiring.layer)));
  return {
    accepted: outcome.allow === true && outcome.registerSideImplemented === true,
    outcome,
  };
}

/**
 * If this session has no catalog yet, bind one from harness atrScope.toolsInScope
 * so in-scope tools can register; novel tools still route to sandbox.
 */
export function ensureSessionCatalogFromHarnessScope(args: {
  readonly wiring: CapabilityRegisterWiring;
  readonly sessionId: string;
  readonly scope: HarnessScope;
}): void {
  const program = Effect.gen(function* () {
    const catalogs = yield* SessionCatalogService;
    const existing = yield* catalogs.get(args.sessionId);
    if (existing) return;
    const tools = new Set(args.scope.toolsInScope);
    yield* catalogs.bind({
      sessionId: args.sessionId,
      tools,
      atrScope: tools,
      boundAt: new Date().toISOString(),
      rebindGeneration: 0,
    });
  });
  Effect.runSync(program.pipe(Effect.provide(args.wiring.layer)));
}

export function assertRegisterSideLiveOrThrow(
  result: RegisterToolWithInterceptResult,
  toolName: string
): void {
  if (result.accepted) return;
  const d = result.outcome;
  const reason =
    d.allow === false
      ? `${d.disposition}: ${d.reason}`
      : "register-side not marked implemented";
  throw new HarnessPluginErrorClass({
    pluginId: CLAWQL_HARNESS_REGISTER_ID,
    reason: `capability register intercept blocked tool "${toolName}" (${reason})`,
  });
}
