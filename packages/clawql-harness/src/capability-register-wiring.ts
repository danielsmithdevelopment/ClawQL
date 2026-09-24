/**
 * Wire CapabilityRegisterIntercept into harness tool registration (§3.5.1).
 * Opt-in: CLAWQL_CAPABILITY_LIFECYCLE=1 or config.enableCapabilityRegisterIntercept.
 */

import {
  CapabilityRegisterIntercept,
  WormAuditSink,
  createSharedCapabilityCatalogLayer,
  type RegisterInterceptOutcome,
  type SessionCatalogService,
  type PromotionStore,
} from "clawql-core";
import { Effect, Layer, type Layer as LayerT } from "effect";
import type { HarnessTool } from "./types.js";
import { HarnessPluginError as HarnessPluginErrorClass } from "./types.js";

export const CLAWQL_HARNESS_REGISTER_ID = "clawql-harness";

export type CapabilityRegisterWiring = {
  readonly layer: LayerT.Layer<
    SessionCatalogService | PromotionStore | CapabilityRegisterIntercept | WormAuditSink
  >;
  readonly harnessId: string;
};

export function capabilityRegisterInterceptEnabled(explicit?: boolean): boolean {
  if (explicit === true) return true;
  if (explicit === false) return false;
  return process.env.CLAWQL_CAPABILITY_LIFECYCLE?.trim() === "1";
}

/** Sync-safe WORM sink for the register boundary (no async Ref bootstrap). */
const SyncMemoryWormLive: LayerT.Layer<WormAuditSink> = Layer.succeed(WormAuditSink, {
  append: () => Effect.void,
});

/**
 * Default process Layer: shared catalog + sync WORM sink for register boundary.
 * Hosts may replace with getCapabilityLifecycleRuntime().catalogLayer + real WormAuditSink.
 */
export function defaultCapabilityRegisterWiring(): CapabilityRegisterWiring {
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
