import type { WORMAppendInput } from "clawql-audit";
import {
  MemoryBackend,
  WORMAuditTrailService,
  makeWORMAuditTrailLayer,
} from "clawql-audit";
import { Effect } from "effect";
import {
  capabilityRegisterInterceptEnabled,
  defaultCapabilityRegisterWiring,
  ensureSessionCatalogFromHarnessScope,
  reportHarnessToolRegistration,
  type CapabilityRegisterWiring,
} from "./capability-register-wiring.js";
import type {
  ClawQLHarnessConfig,
  HarnessContext,
  HarnessPlugin,
  HarnessPluginError,
  HarnessScope,
  HarnessTool,
  LoopHandler,
  LoopState,
  ModelConfig,
} from "./types.js";
import { HarnessPluginError as HarnessPluginErrorClass } from "./types.js";

export type HarnessRegistryState = {
  readonly plugins: readonly HarnessPlugin[];
  readonly tools: Map<string, HarnessTool>;
  /** Tools blocked by register-side intercept (routed_to_sandbox / deny). */
  readonly blockedRegistrations: Map<
    string,
    { readonly disposition: string; readonly reason: string }
  >;
  readonly loopHandlers: {
    plan: LoopHandler[];
    act: LoopHandler[];
    observe: LoopHandler[];
    evaluate: LoopHandler[];
  };
  readonly sessionId: string;
  readonly model: ModelConfig;
  readonly scope: HarnessScope;
  readonly started: boolean;
  readonly capabilityRegisterWiring?: CapabilityRegisterWiring;
};

const defaultScope = (): HarnessScope => ({
  toolsInScope: ["search", "execute", "memory_recall", "audit", "cache"],
  toolsOutOfScope: ["sandbox_exec"],
});

export const isToolInHarnessScope = (toolName: string, scope: HarnessScope): boolean => {
  if (scope.toolsOutOfScope.includes(toolName)) return false;
  return scope.toolsInScope.includes(toolName);
};

export const buildHarnessContext = (state: HarnessRegistryState): HarnessContext => ({
  tools: {
    register: (tool) => {
      if (state.tools.has(tool.name)) {
        throw new Error(`Harness tool already registered: ${tool.name}`);
      }
      if (state.capabilityRegisterWiring) {
        const result = reportHarnessToolRegistration({
          wiring: state.capabilityRegisterWiring,
          sessionId: state.sessionId,
          tool,
          markImplemented: true,
        });
        if (!result.accepted) {
          const disposition =
            result.outcome.allow === false ? result.outcome.disposition : "denied";
          const reason =
            result.outcome.allow === false
              ? result.outcome.reason
              : "register-side not implemented";
          state.blockedRegistrations.set(tool.name, { disposition, reason });
          // §3.5.1: do not treat as live in the harness tool map / MCP bridge.
          return;
        }
      }
      state.tools.set(tool.name, tool);
    },
  },
  loop: {
    onPlan: (handler) => {
      state.loopHandlers.plan.push(handler);
    },
    onAct: (handler) => {
      state.loopHandlers.act.push(handler);
    },
    onObserve: (handler) => {
      state.loopHandlers.observe.push(handler);
    },
    onEvaluate: (handler) => {
      state.loopHandlers.evaluate.push(handler);
    },
  },
  worm: {
    append: (entry) =>
      Effect.gen(function* () {
        const worm = yield* WORMAuditTrailService;
        yield* worm
          .append({
            ...entry,
            sessionId: state.sessionId,
            timestamp: entry.timestamp ?? new Date().toISOString(),
          } satisfies WORMAppendInput)
          .pipe(
            Effect.mapError(
              (err) =>
                new HarnessPluginErrorClass({
                  pluginId: "clawql-harness",
                  reason: err.reason,
                  cause: err,
                })
            )
          );
      }),
  },
  scope: {
    isInScope: (toolName) => isToolInHarnessScope(toolName, state.scope),
  },
  session: {
    id: state.sessionId,
    model: state.model,
  },
});

export const makeHarnessWormLayer = (wormDbPath?: string) => {
  void wormDbPath;
  return makeWORMAuditTrailLayer({
    local: new MemoryBackend(),
    remote: new MemoryBackend(),
    retryMaxAttempts: 3,
    retryBackoffMs: 50,
    retryBackoffMultiplier: 2,
    reconcileIntervalMs: 0,
    merkleBatchSize: 0,
  });
};

export const registerHarnessPlugins = (
  config: ClawQLHarnessConfig
): Effect.Effect<HarnessRegistryState, HarnessPluginError, WORMAuditTrailService> =>
  Effect.gen(function* () {
    const enableIntercept = capabilityRegisterInterceptEnabled(
      config.enableCapabilityRegisterIntercept
    );
    const wiring = enableIntercept
      ? (config.capabilityRegisterWiring ?? defaultCapabilityRegisterWiring())
      : undefined;

    const state: HarnessRegistryState = {
      plugins: config.plugins,
      tools: new Map(),
      blockedRegistrations: new Map(),
      loopHandlers: { plan: [], act: [], observe: [], evaluate: [] },
      sessionId: config.sessionId ?? crypto.randomUUID(),
      model: config.model,
      scope: config.atrScope ?? defaultScope(),
      started: true,
      capabilityRegisterWiring: wiring,
    };

    if (wiring) {
      ensureSessionCatalogFromHarnessScope({
        wiring,
        sessionId: state.sessionId,
        scope: state.scope,
      });
    }

    const ctx = buildHarnessContext(state);

    for (const plugin of config.plugins) {
      yield* plugin.setup(ctx);
    }

    return state;
  });

export const teardownHarnessPlugins = (
  state: HarnessRegistryState
): Effect.Effect<void, HarnessPluginError, WORMAuditTrailService> =>
  Effect.gen(function* () {
    const ctx = buildHarnessContext(state);
    for (const plugin of [...state.plugins].reverse()) {
      if (plugin.teardown) {
        yield* plugin.teardown(ctx);
      }
    }
  });

export const runLoopHandlers = (
  phase: keyof HarnessRegistryState["loopHandlers"],
  state: HarnessRegistryState,
  loopState: LoopState
): Effect.Effect<LoopState, HarnessPluginError, WORMAuditTrailService> =>
  Effect.gen(function* () {
    let current = loopState;
    for (const handler of state.loopHandlers[phase]) {
      current = yield* handler(current);
    }
    return current;
  });
