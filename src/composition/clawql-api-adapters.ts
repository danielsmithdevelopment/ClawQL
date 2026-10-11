import {
  createClawQLApi,
  createClawQLApiAsync,
  composeDefaultPlugins,
  loadSpec,
  makeExecuteLive,
  McpProxyPipeline,
  type ClawQLApiHandle,
  type CreateClawQLApiOptions,
  type ExecuteClawqlOperationParams,
  type LoadedSpec,
  type LoadSpecFn,
} from "clawql-api";
import { defaultPaymentsProxyPlugins } from "clawql-payments/plugin";
import { closeOuroborosPgPool } from "clawql-ouroboros/plugin";
import { closePostgresVectorPoolEffect } from "clawql-memory/vector/pgvector";
import { createRequire } from "node:module";
import { Effect } from "effect";
import { composeHorizontalPluginLayersDynamicEffect } from "./compose-horizontal-plugin-layers-dynamic.js";
import { composeHorizontalPluginLayersStatic } from "./compose-horizontal-plugin-layers-static.js";
import { attachActiveOtelParent, makeEffectOtelTracerLayer } from "./effect-otel-bridge.js";
import {
  disposeProcessWormHostEffect,
  ensureProcessWormHostBootedEffect,
} from "./process-worm-host.js";
import { resolvePluginCompositionFlags } from "./resolve-plugin-flags.js";

const requireFromHere = createRequire(import.meta.url);

let loadSpecOverride: LoadSpecFn | undefined;
let shutdownHooksRegistered = false;

/** Test hook — inject mock loadSpec for search/execute handlers. */
export function setLoadSpecForTests(fn: LoadSpecFn | undefined): void {
  loadSpecOverride = fn;
  resetClawqlApiForTests();
}

function resolveLoadSpec(): LoadSpecFn {
  return loadSpecOverride ?? loadSpec;
}

/** The spec loader search/execute run against (honors {@link setLoadSpecForTests}). */
export const currentLoadSpecEffect: Effect.Effect<LoadSpecFn> = Effect.sync(resolveLoadSpec);

function buildExecuteLive() {
  return makeExecuteLive(resolveLoadSpec());
}

let apiHandle: ClawQLApiHandle | undefined;
let ensureApiPromise: Promise<ClawQLApiHandle> | undefined;

function asError(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(String(cause));
}

function buildClawqlApiOptions(
  pluginLayers: CreateClawQLApiOptions["pluginLayers"],
  vaultSeedLayer?: CreateClawQLApiOptions["vaultSeedLayer"]
): CreateClawQLApiOptions {
  // Omit searchLayer — createClawQLApi wires host.skillRegistry into unified search.
  // Pass loadSpecFn so setLoadSpecForTests overrides both search and execute.
  return {
    executeLayer: buildExecuteLive(),
    loadSpecFn: resolveLoadSpec(),
    plugins: [...composeDefaultPlugins(), ...defaultPaymentsProxyPlugins()],
    pluginLayers,
    vaultSeedLayer,
    runtimeLayers: [makeEffectOtelTracerLayer()],
    prepareEffect: attachActiveOtelParent,
  };
}

function buildClawqlApi(
  pluginLayers: CreateClawQLApiOptions["pluginLayers"],
  vaultSeedLayer?: CreateClawQLApiOptions["vaultSeedLayer"]
): ClawQLApiHandle {
  return createClawQLApi(buildClawqlApiOptions(pluginLayers, vaultSeedLayer));
}

async function resolveVaultSeedLayer(): Promise<
  CreateClawQLApiOptions["vaultSeedLayer"] | undefined
> {
  try {
    const mem = await import("clawql-memory/plugin");
    if (typeof mem.MemoryVaultSeedLive !== "undefined") {
      return mem.MemoryVaultSeedLive;
    }
  } catch {
    /* memory package optional at edge */
  }
  return undefined;
}

/** Sync vault-seed for {@link getClawqlApi} — same Layer as async when memory is installed. */
function resolveVaultSeedLayerSync(): CreateClawQLApiOptions["vaultSeedLayer"] | undefined {
  try {
    const mem = requireFromHere("clawql-memory/plugin") as typeof import("clawql-memory/plugin");
    if (typeof mem.MemoryVaultSeedLive !== "undefined") {
      return mem.MemoryVaultSeedLive;
    }
  } catch {
    /* optional */
  }
  return undefined;
}

async function ensureClawqlApiImpl(): Promise<ClawQLApiHandle> {
  if (apiHandle) return apiHandle;
  if (ensureApiPromise) return ensureApiPromise;
  ensureApiPromise = (async () => {
    void Effect.runPromise(ensureProcessWormHostBootedEffect()).catch(() => undefined);
    const pluginLayers = await Effect.runPromise(
      composeHorizontalPluginLayersDynamicEffect(resolvePluginCompositionFlags())
    );
    const vaultSeedLayer = await resolveVaultSeedLayer();
    apiHandle = await createClawQLApiAsync(buildClawqlApiOptions(pluginLayers, vaultSeedLayer));
    return apiHandle;
  })();
  try {
    return await ensureApiPromise;
  } finally {
    ensureApiPromise = undefined;
  }
}

/**
 * Async production bootstrap — composes horizontal tiers via dynamic import so disabled
 * packages are not statically loaded. Safe to call multiple times; returns existing handle.
 */
export function ensureClawqlApiEffect(): Effect.Effect<ClawQLApiHandle, Error> {
  return Effect.tryPromise({
    try: () => ensureClawqlApiImpl(),
    catch: asError,
  });
}

/** Promise façade for transport hosts that cannot yield* Effects. */
export async function ensureClawqlApi(): Promise<ClawQLApiHandle> {
  return Effect.runPromise(ensureClawqlApiEffect());
}

/** Process-wide ClawQL API runtime (search/execute + plugin registry). */
export function getClawqlApi(): ClawQLApiHandle {
  if (!apiHandle) {
    // Fire-and-forget: durable WORM when CLAWQL_WORM_ENABLED=1 (does not block API build).
    void Effect.runPromise(ensureProcessWormHostBootedEffect()).catch(() => undefined);
    apiHandle = buildClawqlApi(
      composeHorizontalPluginLayersStatic(resolvePluginCompositionFlags()),
      resolveVaultSeedLayerSync()
    );
  }
  return apiHandle;
}

async function disposeClawqlApiImpl(): Promise<void> {
  const handle = apiHandle;
  apiHandle = undefined;
  ensureApiPromise = undefined;
  if (handle) {
    await handle.dispose().catch(() => undefined);
  }
  await Promise.all([
    Effect.runPromise(closePostgresVectorPoolEffect()).catch(() => undefined),
    closeOuroborosPgPool().catch(() => undefined),
    Effect.runPromise(disposeProcessWormHostEffect()).catch(() => undefined),
  ]);
}

/**
 * Dispose plugins, ManagedRuntime, and shared IO pools.
 * Safe to call multiple times; next {@link getClawqlApi} rebuilds a fresh runtime.
 */
export function disposeClawqlApiEffect(): Effect.Effect<void, Error> {
  return Effect.tryPromise({
    try: () => disposeClawqlApiImpl(),
    catch: asError,
  });
}

/** Promise façade for process shutdown. */
export async function disposeClawqlApi(): Promise<void> {
  return Effect.runPromise(disposeClawqlApiEffect());
}

/** Test helper — next getClawqlApi() builds a fresh runtime. */
export function resetClawqlApiForTests(): void {
  if (!apiHandle) return;
  Effect.runSync(apiHandle.registry.teardownAll());
  apiHandle = undefined;
  ensureApiPromise = undefined;
}

/** Register SIGINT/SIGTERM → {@link disposeClawqlApi} once per process. */
export function registerClawqlApiShutdownHooks(): void {
  if (shutdownHooksRegistered) return;
  shutdownHooksRegistered = true;
  const once = (): void => {
    void disposeClawqlApi().catch(() => undefined);
  };
  process.once("SIGINT", once);
  process.once("SIGTERM", once);
}

/** Run HookRegistry pre-execute hooks (Panguard, capability lifecycle, x402, …). */
export function runMcpProxyBeforeCallToolEffect(
  toolName: string,
  args: unknown,
  opts?: { readonly sessionId?: string; readonly atrScopeTokens?: readonly string[] }
): Effect.Effect<void, Error> {
  return Effect.tryPromise({
    try: () =>
      getClawqlApi().run(
        Effect.gen(function* () {
          const pipeline = yield* McpProxyPipeline;
          yield* pipeline.runBeforeCallTool({
            toolName,
            args,
            sessionId: opts?.sessionId,
            atrScopeTokens: opts?.atrScopeTokens,
          });
        })
      ),
    catch: asError,
  });
}

/** Promise façade for MCP CallTool host edge. */
export async function runMcpProxyBeforeCallTool(
  toolName: string,
  args: unknown,
  opts?: { readonly sessionId?: string; readonly atrScopeTokens?: readonly string[] }
): Promise<void> {
  return Effect.runPromise(runMcpProxyBeforeCallToolEffect(toolName, args, opts));
}

export type { ExecuteClawqlOperationParams, LoadedSpec, LoadSpecFn };
